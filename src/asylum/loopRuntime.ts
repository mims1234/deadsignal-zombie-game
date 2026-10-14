/**
 * The Asylum's purchasable loop in the browser: draws the doors, the power lever, the perk machines, the wall chalks
 * and the Pack-a-Punch, offers them to the hold-E interaction, applies perk effects to the game systems and shows the
 * perks on the HUD. The rules and the state are `loop.ts` (pure); this module only reads and changes them through it.
 *
 * Game hooks (see game.ts, all marked "Asylum loop"): construct on the Asylum, `reset()` at the start of a run,
 * `update(dt)` each frame, `maxHealth` for regeneration, `secondWind()` when the player would die, `onPlayerDown()`,
 * `decorateHud()`. The mission code can turn the power on with `setPower(true)` and hear about it through `onPower`.
 *
 * Co-op (`remote` set by the co-op session): the doors and the power are the simulation's. Buying a door and throwing
 * the switch are requests; the simulation's state arrives through `applyRemote` and a bought door is paid for on its
 * confirmation (`confirmDoor`). Perks, wall-buys and the Pack-a-Punch stay here: they only change this player.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER, WEAPONS } from '../config';
import { spendCash } from '../logic/economy';
import type { GameCtx } from '../game/ctx';
import type { Interaction, InteractionTarget } from '../game/interaction';
import type { WeaponId } from '../types';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import type { LampSpec } from '../world/builder';
import { signMaterial } from '../world/landmarks/tex';
import {
  buyDoor, buyPerk, buyWall, createLoopState, doorState, isPowerOn, losePerks, packAPunch, papOffer, perkMods, perksOf, perkState, resetLoopState,
  setPower as setLoopPower, SOLO_ID, spawnAllowed, useSecondWind, wallOffer, type LoopResult, type LoopState, type PerkMods,
} from './loop';
import { LOOP, PERK_DEFS, WALL_PRICES, type PerkId } from './loopConfig';
import { ASYLUM_DOORS, PAP_MACHINE, PERK_MACHINES, POWER_LEVER, WALL_BUYS, ZONE_NAMES, zoneAt, type DoorDef, type Placed } from './loopData';
import { MACHINE_SIZE, yawOf } from './zoneWalls';
import './loop.css';

/** What the loop needs from the game besides the shared context. */
export interface AsylumHost extends GameCtx {
  readonly interaction: Interaction;
  /** The infected's flow field must be recomputed (a door changed). */
  invalidateFlow(): void;
}

/** What the in-game machine for the Pack-a-Punch is called. */
const PAP_NAME = 'PUNCH PRESS';
const PAP_COLOR = 0xb05cff;
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const ease = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

interface DoorView {
  def: DoorDef;
  root: THREE.Group;
  /** Hinged leaves (door: one, gate: two) or the debris pile. */
  parts: THREE.Object3D[];
  /** 0..1 through the opening animation; -1 = shut and still. */
  t: number;
  /** The side the buyer stood on (+1 / -1 along the doorway's normal); the leaves swing to the other side. */
  dir: number;
}

interface MachineView {
  root: THREE.Group;
  /** Materials that light up with the power, and how bright each gets. */
  glow: THREE.MeshStandardMaterial[];
  glowOn: number[];
  lamp: LampSpec;
}

export class AsylumLoopRuntime {
  /** The loop's shared state (doors, power, perks per player). Plain data: a co-op snapshot can carry it as is. */
  readonly state: LoopState = createLoopState();
  /** Whose perks this screen shows and uses. */
  playerId = SOLO_ID;
  /** The power came on (or went off): mission code can listen here. */
  onPower: ((on: boolean) => void) | null = null;
  /** Co-op: ask the simulation to open door `i` / throw the power switch (null: solo, decided here). */
  remote: { door(i: number): void; lever(): void } | null = null;

  private coop = false;
  private readonly root = new THREE.Group();
  private readonly doors: DoorView[] = [];
  private readonly machines = new Map<PerkId, MachineView>();
  private readonly pap: MachineView & { roller: THREE.Mesh };
  private readonly lever: { root: THREE.Group; arm: THREE.Group; light: THREE.MeshStandardMaterial; t: number };
  /** Doors as drawn (1 open): compared with the state to animate what changed. */
  private shown: number[] = ASYLUM_DOORS.map(() => 0);
  private powerShown = false;
  private papBusy = 0;
  /** Lamps that fail without the power and steady with it, and their original modes. */
  private readonly failing: { lamp: LampSpec; mode: LampSpec['mode'] }[] = [];
  private readonly hudRow: HTMLElement | null;
  private hudKey = '';
  private readonly mods: PerkMods = perkMods([], PLAYER.maxHealth);

  constructor(
    private readonly g: AsylumHost,
    uiRoot: HTMLElement,
  ) {
    this.root.name = 'AsylumLoop';
    g.worldRoot.add(this.root);
    for (let i = 0; i < ASYLUM_DOORS.length; i++) this.doors.push(this.buildDoor(ASYLUM_DOORS[i]!));
    for (const m of PERK_MACHINES) this.machines.set(m.perk, this.buildPerkMachine(m, m.perk));
    this.pap = this.buildPap(PAP_MACHINE);
    this.lever = this.buildLever(POWER_LEVER);
    for (const w of WALL_BUYS) this.buildWallBuy(w, w.weapon);
    for (const lamp of g.level.lights) if (lamp.mode === 'fail') this.failing.push({ lamp, mode: lamp.mode });

    // the director only uses spawn points in open zones; a door that changes re-routes everyone
    g.zombies.spawnAllowed = (x, z) => spawnAllowed(this.state, x, z);
    if (g.level.doors) g.level.doors.onChange = () => g.invalidateFlow();
    g.interaction.sources.push((targets) => this.targets(targets));

    // perks on the HUD: a row of chips above the funds
    const bl = uiRoot.querySelector('.ds-bottomleft');
    this.hudRow = document.createElement('div');
    this.hudRow.className = 'asy-perks';
    this.hudRow.hidden = true;
    if (bl) bl.insertBefore(this.hudRow, bl.querySelector('.ds-cash'));
  }

  // ---------------------------------------------------------------------------------------------
  // public API
  // ---------------------------------------------------------------------------------------------

  get powerOn(): boolean {
    return isPowerOn(this.state);
  }

  /** Turn the power on (the lever, or a mission). Off is only for a new run / co-op sync. */
  setPower(on: boolean): void {
    if (!setLoopPower(this.state, on)) return;
    this.sync();
    this.onPower?.(on);
  }

  /** Co-op: revive holds are multiplied by this (SECOND WIND picks teammates up faster). */
  get reviveMul(): number {
    return this.mods.reviveMul;
  }

  /** Max health with the player's perks (health regenerates to this). */
  get maxHealth(): number {
    return this.mods.maxHealth;
  }

  /** The player's perks, in the order bought. */
  get perks(): PerkId[] {
    return perksOf(this.state, this.playerId);
  }

  /** Start of a run: every door shut, the power off, no perks (co-op: the simulation's state follows in its reports). */
  reset(coop: boolean): void {
    this.coop = coop;
    resetLoopState(this.state);
    this.papBusy = 0;
    this.sync(true);
  }

  /** Co-op: the simulation's doors (bit i: door i open) and power. Changes animate and announce as in solo. */
  applyRemote(doors: number, power: boolean): void {
    const was = this.powerOn;
    for (let i = 0; i < ASYLUM_DOORS.length; i++) this.state.doors[i] = doors & (1 << i) ? 1 : 0;
    this.state.power = power ? 1 : 0;
    this.sync();
    if (was !== this.powerOn) this.onPower?.(this.powerOn);
  }

  /** Co-op: the simulation opened door `i` for this player - pay for it now. */
  confirmDoor(i: number, cost: number): void {
    const d = ASYLUM_DOORS[i];
    if (!d) return;
    const inv = this.g.session.inv;
    // checked before asking; if it was spent in the meantime, what is left goes
    if (!spendCash(inv, cost)) spendCash(inv, inv.cash);
    this.after({ ok: true, reason: 'ok', cost, message: d.kind === 'debris' ? 'Debris cleared' : d.kind === 'gate' ? 'Gate open' : 'Door open' }, d, () => {});
  }

  /**
   * Bring the world in line with `state` (after the loop changed it, or a co-op snapshot replaced it): door colliders,
   * nav and models, the power's lights. `instant` skips the animations (a new run).
   */
  sync(instant = false): void {
    const g = this.g;
    g.level.doors?.sync(this.state.doors);
    const p = g.player;
    for (let i = 0; i < this.doors.length; i++) {
      const v = this.doors[i]!;
      const open = this.state.doors[i] === 1;
      if (open === (this.shown[i] === 1)) continue;
      this.shown[i] = open ? 1 : 0;
      if (!open || instant) {
        this.poseDoor(v, open ? 1 : 0);
        v.t = -1;
        continue;
      }
      const across = v.def.along === 'x' ? p.z - v.def.z : p.x - v.def.x;
      v.dir = across >= 0 ? 1 : -1;
      v.t = 0;
      const pos = { x: v.def.x, y: 1.2, z: v.def.z };
      g.audio.play(v.def.kind === 'gate' ? 'amb_clang' : v.def.kind === 'debris' ? 'amb_debris' : 'amb_creak', { pos, priority: 2 });
      if (v.def.kind === 'debris') g.fx.dust({ x: v.def.x, y: 0.3, z: v.def.z }, 1);
    }
    const on = this.powerOn;
    if (on !== this.powerShown) {
      this.powerShown = on;
      this.applyPower(on, !instant);
    }
  }

  /** Solo: the player would die. SECOND WIND gets them up instead (perks spent). Returns true when it did. */
  secondWind(): boolean {
    if (this.coop || !useSecondWind(this.state, this.playerId)) return false;
    const g = this.g;
    this.refreshMods();
    g.session.vitals.health = Math.round(this.mods.maxHealth * LOOP.perk.secondWindHealth);
    g.session.vitals.armor = PLAYER.maxArmor;
    g.session.sinceDamage = 0;
    g.banner('SECOND WIND', 'Back on your feet - your perks are spent', 'good', 3);
    g.feed('SECOND WIND - BACK UP', 'good');
    g.audio.play('pickup_plate', { priority: 3 });
    g.hudEvent({ type: 'flash', color: '#58b4ff', strength: 0.5 });
    return true;
  }

  /** The player went down or died: perks are lost. */
  onPlayerDown(): void {
    losePerks(this.state, this.playerId);
  }

  update(dt: number): void {
    const g = this.g;
    this.refreshMods();
    g.weapons.perkReloadMul = this.mods.reloadMul;
    g.weapons.perkFireIntervalMul = this.mods.fireIntervalMul;
    const v = g.session.vitals;
    if (v.health > this.mods.maxHealth) v.health = this.mods.maxHealth;

    // doors opening
    for (const d of this.doors) {
      if (d.t < 0) continue;
      d.t = Math.min(1, d.t + dt / (d.def.kind === 'debris' ? 0.9 : 0.7));
      this.poseDoor(d, ease(d.t));
      if (d.t >= 1) d.t = -1;
    }
    // the lever
    const target = this.powerOn ? 1 : 0;
    this.lever.t += Math.sign(target - this.lever.t) * Math.min(Math.abs(target - this.lever.t), dt * 3);
    this.lever.arm.rotation.x = 0.55 + ease(this.lever.t) * 2.0;
    // the press works on a gun
    if (this.papBusy > 0) {
      this.papBusy = Math.max(0, this.papBusy - dt);
      this.pap.roller.rotation.x += dt * 14;
      this.pap.glow[0]!.emissiveIntensity = 1.1 + Math.sin(g.time * 30) * 0.4;
      if (this.papBusy === 0) {
        this.pap.glow[0]!.emissiveIntensity = this.pap.glowOn[0]!;
        g.audio.play('box_reveal', { pos: { x: PAP_MACHINE.x, y: 1.4, z: PAP_MACHINE.z }, priority: 2 });
        g.fx.sparkle({ x: PAP_MACHINE.x, y: 1.6, z: PAP_MACHINE.z }, PAP_COLOR, 24);
      }
    } else if (this.powerOn) this.pap.roller.rotation.x += dt * 1.5;
    this.updateHudRow();
  }

  /** HUD: max health with perks, and the loop's places on the maps. */
  decorateHud(st: HudState, md: MapDynamic): void {
    st.maxHealth = this.mods.maxHealth;
    const on = this.powerOn;
    for (let i = 0; i < ASYLUM_DOORS.length; i++) {
      if (this.state.doors[i] === 1) continue;
      const d = ASYLUM_DOORS[i]!;
      md.markers.push({ id: `asy-door:${d.id}`, kind: 'gate', x: d.x, z: d.z, label: `$${d.cost}`, visible: true });
    }
    if (!on) md.markers.push({ id: 'asy-power', kind: 'objective', x: POWER_LEVER.x, z: POWER_LEVER.z, label: 'POWER', visible: true });
    for (const m of PERK_MACHINES) {
      const def = PERK_DEFS[m.perk];
      md.markers.push({ id: `asy-perk:${m.perk}`, kind: 'buy', x: m.x, z: m.z, label: def.name, color: hex(def.color), visible: true, dim: !on });
    }
    md.markers.push({ id: 'asy-pap', kind: 'upgrade', x: PAP_MACHINE.x, z: PAP_MACHINE.z, label: PAP_NAME, color: hex(PAP_COLOR), visible: true, dim: !on });
  }

  dispose(): void {
    this.root.removeFromParent();
    this.hudRow?.remove();
  }

  // ---------------------------------------------------------------------------------------------
  // interaction
  // ---------------------------------------------------------------------------------------------

  private targets(out: InteractionTarget[]): void {
    const g = this.g;
    if (!g.playerAlive()) return;
    const p = g.player;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const looking = (x: number, z: number, dist: number): boolean => dist < 1.2 || ((x - p.x) * fx + (z - p.z) * fz) / dist > 0.25;
    const cash = g.session.inv.cash;
    const reach = LOOP.reach;

    // doors
    for (let i = 0; i < ASYLUM_DOORS.length; i++) {
      const d = ASYLUM_DOORS[i]!;
      const st = doorState(this.state, i, cash);
      if (st === 'open' || st === 'invalid') continue;
      const a = d.along === 'x' ? p.x - d.x : p.z - d.z;
      const n = d.along === 'x' ? p.z - d.z : p.x - d.x;
      const dist = Math.hypot(Math.max(0, Math.abs(a) - d.width / 2), n);
      if (dist > reach || !looking(d.x, d.z, Math.hypot(a, n))) continue;
      const here = zoneAt(p.x, p.z);
      const beyond = d.zones[0] === here ? d.zones[1] : d.zones[0];
      const verb = d.kind === 'gate' ? 'OPEN GATE' : d.kind === 'debris' ? 'CLEAR DEBRIS' : 'OPEN DOOR';
      out.push({
        id: `asy-door:${d.id}`,
        dist,
        text: `${verb} - $${d.cost}`,
        sub: st === 'unaffordable' ? 'NOT ENOUGH $' : `Opens up ${ZONE_NAMES[beyond]}`,
        tone: st === 'unaffordable' ? 'warn' : 'normal',
        hold: LOOP.doorHold,
        enabled: true,
        onUse: () => {
          const remote = this.remote;
          if (!remote) {
            this.after(buyDoor(this.state, i, g.session.inv), { x: d.x, z: d.z }, () => this.sync());
            return;
          }
          // co-op: ask; the simulation opens it for everyone and this player pays on its confirmation
          if (doorState(this.state, i, g.session.inv.cash) === 'ok') remote.door(i);
          else this.after({ ok: false, reason: 'unaffordable', cost: d.cost, message: 'NOT ENOUGH $' }, d, () => {});
        },
      });
    }

    // the power lever
    if (!this.powerOn) {
      const L = POWER_LEVER;
      const dist = this.frontDist(L, 0.3);
      if (dist <= reach && looking(L.x, L.z, dist)) {
        out.push({ id: 'asy-lever', dist, text: 'THROW THE POWER SWITCH', sub: 'Wake the perk machines and the press', tone: 'warn', hold: LOOP.leverHold, enabled: true, onUse: () => this.throwLever() });
      }
    }

    // perk machines
    for (const m of PERK_MACHINES) {
      const dist = this.frontDist(m, MACHINE_SIZE.perk.d / 2);
      if (dist > reach || !looking(m.x, m.z, dist)) continue;
      const def = PERK_DEFS[m.perk];
      const st = perkState(this.state, this.playerId, m.perk, cash);
      const id = `asy-perk:${m.perk}`;
      if (st === 'nopower' || st === 'owned' || st === 'max') {
        const why = st === 'nopower' ? 'NEEDS POWER' : st === 'owned' ? 'OWNED' : `${LOOP.maxPerks} PERKS MAX`;
        out.push({ id, dist, text: `${def.name} - ${why}`, sub: def.blurb, tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
        continue;
      }
      out.push({
        id,
        dist,
        text: `${def.name} - $${def.cost}`,
        sub: st === 'unaffordable' ? 'NOT ENOUGH $' : def.blurb,
        tone: st === 'unaffordable' ? 'warn' : 'good',
        hold: LOOP.buyHold,
        enabled: true,
        onUse: () => this.after(buyPerk(this.state, this.playerId, m.perk, g.session.inv), m, () => this.drankPerk(m.perk)),
      });
    }

    // the Pack-a-Punch
    {
      const P = PAP_MACHINE;
      const dist = this.frontDist(P, MACHINE_SIZE.pap.d / 2);
      if (dist <= reach && looking(P.x, P.z, dist)) {
        const o = papOffer(this.state, g.session.inv);
        const held = g.session.inv.slots[g.session.inv.activeSlot];
        const name = held ? WEAPONS[held.id].short : '';
        if (this.papBusy > 0) out.push({ id: 'asy-pap', dist, text: `${PAP_NAME} - WORKING`, sub: 'Hold on...', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
        else if (o.state === 'nopower' || o.state === 'maxed' || o.state === 'noweapon') {
          const why = o.state === 'nopower' ? 'NEEDS POWER' : o.state === 'maxed' ? `${name} FULLY UPGRADED` : 'NOTHING IN YOUR HANDS';
          out.push({ id: 'asy-pap', dist, text: `${PAP_NAME} - ${why}`, sub: 'Upgrades the gun in your hands', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
        } else {
          out.push({
            id: 'asy-pap',
            dist,
            text: `${PAP_NAME} - $${o.cost}`,
            sub: o.state === 'unaffordable' ? 'NOT ENOUGH $' : `${name} -> ${o.label}, magazine and reserve filled`,
            tone: o.state === 'unaffordable' ? 'warn' : 'good',
            hold: LOOP.buyHold,
            enabled: true,
            onUse: () => this.after(packAPunch(this.state, g.session.inv), P, () => this.startPress()),
          });
        }
      }
    }

    // wall chalks
    for (const w of WALL_BUYS) {
      const dist = this.frontDist(w, 0);
      if (dist > reach || !looking(w.x, w.z, dist)) continue;
      const o = wallOffer(g.session.inv, w.weapon);
      const short = WEAPONS[w.weapon].short;
      const id = `asy-wall:${w.weapon}`;
      if (o.state === 'full') {
        out.push({ id, dist, text: `${short} AMMO - FULL`, sub: 'Nothing to buy', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
        continue;
      }
      const held = g.session.inv.slots[g.session.inv.activeSlot];
      const sub = o.state === 'unaffordable' ? 'NOT ENOUGH $' : o.kind === 'ammo' ? 'Refill magazine and reserve' : held ? `Replaces your ${WEAPONS[held.id].short}` : WEAPONS[w.weapon].name;
      out.push({
        id,
        dist,
        text: o.kind === 'ammo' ? `${short} AMMO - $${o.cost}` : `BUY ${short} - $${o.cost}`,
        sub,
        tone: o.state === 'unaffordable' ? 'warn' : 'normal',
        hold: LOOP.buyHold,
        enabled: true,
        onUse: () => {
          const r = buyWall(g.session.inv, w.weapon);
          this.after(r, w, () => {
            if (r.swapped) g.weapons.cancelActions();
            g.audio.play(r.swapped ? 'weapon_draw' : 'pickup_ammo', { priority: 2 });
          });
        },
      });
    }
  }

  /** How far the player is from the front of a placed thing (Infinity when behind it). */
  private frontDist(p: Placed, depth: number): number {
    const pl = this.g.player;
    const dx = pl.x - p.x;
    const dz = pl.z - p.z;
    if (dx * p.fx + dz * p.fz < depth - 0.05) return Infinity;
    return Math.max(0, Math.hypot(dx, dz) - depth);
  }

  /** Feedback for a purchase: the cash, a line in the feed, a sound; `then` runs when it went through. */
  private after(r: LoopResult, at: { x: number; z: number }, then: () => void): void {
    const g = this.g;
    if (!r.ok) {
      g.audio.play('buy_denied', { priority: 2, volume: 0.8 });
      g.feed(r.message.toUpperCase(), 'warn');
      return;
    }
    g.hudEvent({ type: 'cash', amount: -r.cost });
    g.feed(`${r.message.toUpperCase()}  -$${r.cost}`, 'good');
    g.audio.play('buy_ok', { priority: 2 });
    g.fx.sparkle({ x: at.x, y: 1.5, z: at.z }, 0xffd070, 12);
    then();
  }

  private throwLever(): void {
    const g = this.g;
    g.audio.play('amb_clang', { pos: { x: POWER_LEVER.x, y: 1.4, z: POWER_LEVER.z }, priority: 3 });
    if (this.remote) this.remote.lever(); // co-op: the power comes on for everyone with the simulation's next report
    else this.setPower(true);
  }

  private drankPerk(perk: PerkId): void {
    const g = this.g;
    const def = PERK_DEFS[perk];
    this.refreshMods();
    if (perk === 'ironhide') g.session.vitals.health = this.mods.maxHealth;
    g.audio.play('upgrade_ok', { priority: 2 });
    g.banner(def.name, def.blurb, 'good', 2.5);
  }

  private startPress(): void {
    const g = this.g;
    g.weapons.cancelActions();
    this.papBusy = LOOP.pap.workTime;
    g.audio.play('upgrade_ok', { pos: { x: PAP_MACHINE.x, y: 1.4, z: PAP_MACHINE.z }, priority: 3 });
    g.audio.play('defense_start', { pos: { x: PAP_MACHINE.x, y: 1.4, z: PAP_MACHINE.z }, priority: 2, volume: 0.6 });
  }

  private refreshMods(): void {
    Object.assign(this.mods, perkMods(perksOf(this.state, this.playerId), PLAYER.maxHealth));
  }

  // ---------------------------------------------------------------------------------------------
  // power
  // ---------------------------------------------------------------------------------------------

  private applyPower(on: boolean, announce: boolean): void {
    const g = this.g;
    const lights = g.level.lights;
    for (const m of [...this.machines.values(), this.pap]) {
      m.glow.forEach((mat, i) => (mat.emissiveIntensity = on ? m.glowOn[i]! : 0.04));
      const i = lights.indexOf(m.lamp);
      if (on && i < 0) lights.push(m.lamp);
      else if (!on && i >= 0) lights.splice(i, 1);
    }
    for (const f of this.failing) f.lamp.mode = on ? 'steady' : f.mode;
    this.lever.light.color.set(on ? 0x2a5a2a : 0x5a1a14);
    this.lever.light.emissive.set(on ? 0x5dff7a : 0xff3a24);
    if (!announce) {
      this.lever.t = on ? 1 : 0;
      return;
    }
    if (on) {
      g.banner('POWER RESTORED', 'The machines are waking up', 'good', 4.5);
      g.audio.play('defense_start', { priority: 3, volume: 1 });
      g.audio.play('contract_complete', { priority: 3, delay: 0.7 });
      g.audio.play('amb_thunder', { priority: 2, delay: 0.2, volume: 0.7 });
      g.shake(0.35);
      g.hudEvent({ type: 'flash', color: '#fff2c0', strength: 0.25 });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------------------------

  private updateHudRow(): void {
    const row = this.hudRow;
    if (!row) return;
    const perks = this.perks;
    const key = perks.join(',');
    if (key === this.hudKey) return;
    this.hudKey = key;
    row.replaceChildren();
    row.hidden = perks.length === 0;
    for (const p of perks) {
      const def = PERK_DEFS[p];
      const chip = document.createElement('span');
      chip.className = 'asy-perk';
      chip.style.setProperty('--c', hex(def.color));
      const b = document.createElement('b');
      b.textContent = def.mark;
      chip.append(b, def.name);
      row.appendChild(chip);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // models
  // ---------------------------------------------------------------------------------------------

  private place(obj: THREE.Object3D, p: Placed): void {
    obj.position.set(p.x, 0, p.z);
    obj.rotation.y = yawOf(p);
    this.root.add(obj);
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, cast = false): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  private buildDoor(def: DoorDef): DoorView {
    const mats = this.g.mats;
    const root = new THREE.Group();
    root.position.set(def.x, 0, def.z);
    root.rotation.y = def.along === 'x' ? 0 : Math.PI / 2;
    this.root.add(root);
    const parts: THREE.Object3D[] = [];
    const w = def.width;
    const h = def.height;
    const chain = (parent: THREE.Object3D, cx: number, span: number): void => {
      // a chain across both faces in an X, padlocked in the middle
      for (const face of [-1, 1]) {
        for (const s of [-1, 1]) {
          const link = this.mesh(new THREE.BoxGeometry(span, 0.05, 0.05), mats.get('rust'), cx, 1.15, face * 0.09, parent);
          link.rotation.z = s * 0.55;
        }
      }
      this.mesh(new THREE.BoxGeometry(0.14, 0.18, 0.08), mats.get('steel'), cx, 1.1, 0.12, parent);
    };
    if (def.kind === 'door') {
      const hinge = new THREE.Group();
      hinge.position.set(-w / 2, 0, 0);
      root.add(hinge);
      const leaf = new THREE.Group();
      leaf.position.set(w / 2, 0, 0);
      hinge.add(leaf);
      this.mesh(new THREE.BoxGeometry(w - 0.04, h - 0.04, 0.08), mats.get('wood'), 0, h / 2, 0, leaf, true);
      this.mesh(new THREE.BoxGeometry(0.4, 0.3, 0.1), mats.get('glassDark'), 0, h * 0.72, 0, leaf);
      chain(leaf, 0, w * 1.05);
      parts.push(hinge);
    } else if (def.kind === 'gate') {
      for (const side of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(side * (w / 2), 0, 0);
        root.add(hinge);
        this.mesh(gateLeafGeometry(w / 2, h), mats.get('steelDark'), -side * (w / 4), 0, 0, hinge, true);
        parts.push(hinge);
      }
      chain(root, 0, 0.9);
    } else {
      // debris: a fallen cabinet, planks and broken masonry heaped in the doorway
      const pile = new THREE.Group();
      root.add(pile);
      let s = def.x * 131 + def.z * 17 + 7;
      const rand = (): number => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
      const rubble: THREE.BufferGeometry[] = [];
      const wood: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 14; i++) {
        const big = i < 5;
        const sx = big ? 0.6 + rand() * 0.5 : 0.25 + rand() * 0.35;
        const geo = new THREE.BoxGeometry(sx, sx * (0.5 + rand() * 0.5), sx * (0.7 + rand() * 0.6));
        geo.rotateY(rand() * Math.PI);
        geo.rotateZ((rand() - 0.5) * 0.6);
        geo.translate((rand() - 0.5) * (w + 0.4), sx * 0.3 + rand() * (big ? 0.3 : 1.1), (rand() - 0.5) * 0.9);
        rubble.push(geo);
      }
      for (let i = 0; i < 6; i++) {
        const geo = new THREE.BoxGeometry(w + 0.6, 0.12, 0.25);
        geo.rotateZ((rand() - 0.5) * 1.2);
        geo.rotateY((rand() - 0.5) * 0.5);
        geo.translate((rand() - 0.5) * 0.4, 0.3 + rand() * (h - 0.6), (rand() - 0.5) * 0.6);
        wood.push(geo);
      }
      const cabinet = new THREE.BoxGeometry(0.55, 1.4, 0.6);
      cabinet.rotateZ(1.2);
      cabinet.translate(0.3, 0.6, 0);
      this.mesh(mergeGeometries(rubble)!, mats.get('rubble'), 0, 0, 0, pile, true);
      this.mesh(mergeGeometries(wood)!, mats.get('wood'), 0, 0, 0, pile, true);
      this.mesh(cabinet, mats.get('steelDark'), 0, 0, 0, pile, true);
      parts.push(pile);
    }
    return { def, root, parts, t: -1, dir: 1 };
  }

  /** Draw a door at `k` of the way open (0 shut, 1 open). */
  private poseDoor(v: DoorView, k: number): void {
    v.root.visible = true;
    if (v.def.kind === 'debris') {
      const pile = v.parts[0]!;
      pile.position.y = -k * 1.6;
      pile.scale.setScalar(1 - k * 0.5);
      v.root.visible = k < 1;
      return;
    }
    if (v.def.kind === 'door') {
      v.parts[0]!.rotation.y = v.dir * k * 1.75;
      return;
    }
    // gate: both leaves swing the same way, away from the buyer
    v.parts.forEach((hinge, i) => (hinge.rotation.y = (i === 0 ? -1 : 1) * -v.dir * k * 1.6));
    v.root.children.forEach((c) => {
      if (!v.parts.includes(c)) c.visible = k < 0.05;
    });
  }

  private buildPerkMachine(p: Placed, perk: PerkId): MachineView {
    const def = PERK_DEFS[perk];
    const S = MACHINE_SIZE.perk;
    const g = new THREE.Group();
    const color = new THREE.Color(def.color);
    const body = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.35), roughness: 0.5, metalness: 0.4 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x141414, emissive: color, emissiveIntensity: 0.04, roughness: 0.25, metalness: 0.2 });
    const sign = signMaterial([def.name], { bg: '#0b0d0c', fg: hex(def.color), border: hex(def.color), aspect: 3.4, emissive: true, worn: false }).clone();
    sign.emissiveIntensity = 0.04;
    const price = signMaterial([`$${def.cost}`], { bg: '#e6e0cc', fg: '#141414', aspect: 2.2, worn: true });
    this.mesh(new THREE.BoxGeometry(S.w, S.h - 0.35, S.d), body, 0, (S.h - 0.35) / 2, 0, g, true);
    this.mesh(new THREE.BoxGeometry(S.w + 0.06, 0.08, S.d + 0.06), this.g.mats.get('steelDark'), 0, S.h - 0.31, 0, g);
    this.mesh(new THREE.PlaneGeometry(S.w - 0.24, 1.15), panel, 0, 1.15, S.d / 2 + 0.005, g);
    // the backlit name on top
    this.mesh(new THREE.BoxGeometry(S.w, 0.36, 0.2), body, 0, S.h - 0.09, -0.1, g);
    this.mesh(new THREE.PlaneGeometry(S.w - 0.06, 0.32), sign, 0, S.h - 0.09, 0.005, g);
    // the dispenser and the price card
    this.mesh(new THREE.BoxGeometry(0.5, 0.26, 0.08), this.g.mats.get('steelDark'), 0, 0.42, S.d / 2 + 0.02, g);
    this.mesh(new THREE.PlaneGeometry(0.34, 0.15), price, S.w / 2 - 0.24, 0.42, S.d / 2 + 0.006, g);
    this.place(g, p);
    return { root: g, glow: [panel, sign], glowOn: [0.45, 0.8], lamp: this.lampAt(p, 1.3, 2.6, def.color, 10) };
  }

  private buildPap(p: Placed): MachineView & { roller: THREE.Mesh } {
    const S = MACHINE_SIZE.pap;
    const g = new THREE.Group();
    const mats = this.g.mats;
    const glow = new THREE.MeshStandardMaterial({ color: 0x120818, emissive: PAP_COLOR, emissiveIntensity: 0.04, roughness: 0.25, metalness: 0.3 });
    const sign = signMaterial([PAP_NAME], { bg: '#0d0a12', fg: hex(PAP_COLOR), border: hex(PAP_COLOR), aspect: 3.6, emissive: true, worn: false }).clone();
    sign.emissiveIntensity = 0.04;
    // the press: a heavy steel bed, a glowing roller and a tall back plate with the name
    this.mesh(new THREE.BoxGeometry(S.w, 1.05, S.d), mats.get('steelDark'), 0, 0.525, 0, g, true);
    this.mesh(new THREE.BoxGeometry(S.w + 0.08, 0.1, S.d + 0.08), mats.get('rust'), 0, 1.1, 0, g);
    this.mesh(new THREE.BoxGeometry(S.w, 1.1, 0.25), mats.get('steelDark'), 0, 1.65, -S.d / 2 + 0.125, g, true);
    this.mesh(new THREE.PlaneGeometry(S.w - 0.1, 0.42), sign, 0, 1.95, -S.d / 2 + 0.255, g);
    const roller = this.mesh(new THREE.CylinderGeometry(0.13, 0.13, S.w - 0.36, 18).rotateZ(Math.PI / 2), glow, 0, 1.28, 0.12, g);
    for (const s of [-1, 1]) this.mesh(new THREE.BoxGeometry(0.12, 0.4, 0.42), mats.get('steel'), s * (S.w / 2 - 0.1), 1.28, 0.12, g);
    this.mesh(new THREE.BoxGeometry(0.9, 0.08, 0.3), mats.get('hazard'), 0, 0.8, S.d / 2 + 0.01, g);
    this.place(g, p);
    return { root: g, glow: [glow, sign], glowOn: [0.55, 0.8], roller, lamp: this.lampAt(p, 1.4, 2.6, PAP_COLOR, 12) };
  }

  private buildLever(p: Placed): { root: THREE.Group; arm: THREE.Group; light: THREE.MeshStandardMaterial; t: number } {
    const mats = this.g.mats;
    const g = new THREE.Group();
    this.mesh(new THREE.BoxGeometry(0.7, 1.0, 0.16), mats.get('steelDark'), 0, 1.4, -0.05, g, true);
    this.mesh(new THREE.BoxGeometry(0.62, 0.1, 0.02), mats.get('hazard'), 0, 1.84, 0.04, g);
    const plate = signMaterial(['MAIN POWER'], { bg: '#d8d2bc', fg: '#151515', aspect: 3.2, worn: true });
    this.mesh(new THREE.PlaneGeometry(0.5, 0.15), plate, 0, 1.02, 0.035, g);
    const light = new THREE.MeshStandardMaterial({ color: 0x5a1a14, emissive: 0xff3a24, emissiveIntensity: 1.2 });
    this.mesh(new THREE.SphereGeometry(0.05, 10, 8), light, 0.24, 1.7, 0.05, g);
    const arm = new THREE.Group();
    arm.position.set(0, 1.35, 0.06);
    g.add(arm);
    this.mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), mats.get('steel'), 0, 0.25, 0, arm);
    this.mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0xb02018, roughness: 0.5 }), 0, 0.5, 0, arm);
    arm.rotation.x = 0.55;
    this.place(g, p);
    return { root: g, arm, light, t: 0 };
  }

  private buildWallBuy(p: Placed, weapon: WeaponId): void {
    const tex = chalkTexture(weapon);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const g = new THREE.Group();
    this.mesh(new THREE.PlaneGeometry(1.7, 0.85), mat, 0, 1.5, 0.01, g);
    this.place(g, p);
  }

  /** A lamp in front of a machine, added to the level's light pool while the power is on. */
  private lampAt(p: Placed, out: number, y: number, color: number, intensity: number): LampSpec {
    return { x: p.x + p.fx * out, y, z: p.z + p.fz * out, color, intensity, distance: 7, mode: 'steady', weight: 1.4, tag: 'asylum-power' };
  }
}

// ---------------------------------------------------------------------------------------------
// shared geometry and textures
// ---------------------------------------------------------------------------------------------

const leafCache = new Map<string, THREE.BufferGeometry>();

/** One leaf of an iron gate: rails, bars with spear tips. Origin at the leaf's centre bottom. */
function gateLeafGeometry(w: number, h: number): THREE.BufferGeometry {
  const key = `${w}:${h}`;
  const hit = leafCache.get(key);
  if (hit) return hit;
  const parts: THREE.BufferGeometry[] = [];
  for (const y of [0.18, h * 0.55, h - 0.12]) parts.push(new THREE.BoxGeometry(w, 0.07, 0.06).translate(0, y, 0));
  const n = Math.max(3, Math.round(w / 0.16));
  for (let i = 0; i <= n; i++) {
    const x = -w / 2 + (w * i) / n;
    parts.push(new THREE.BoxGeometry(0.035, h, 0.035).translate(x, h / 2, 0));
    parts.push(new THREE.ConeGeometry(0.04, 0.16, 4).translate(x, h + 0.08, 0));
  }
  const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  leafCache.set(key, geo);
  return geo;
}

/** A gun drawn in chalk on the wall, with its name and price. */
function chalkTexture(weapon: WeaponId): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  let s = weapon.length * 977 + 13;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  x.strokeStyle = 'rgba(236, 234, 222, 0.9)';
  x.fillStyle = 'rgba(236, 234, 222, 0.9)';
  x.lineCap = 'round';
  x.lineJoin = 'round';
  // a rough chalk rectangle, drawn twice with a wobble
  const rough = (x0: number, y0: number, w: number, h: number, passes = 2): void => {
    for (let k = 0; k < passes; k++) {
      x.lineWidth = 3 + rand() * 2;
      x.beginPath();
      const j = (): number => (rand() - 0.5) * 4;
      x.moveTo(x0 + j(), y0 + j());
      x.lineTo(x0 + w + j(), y0 + j());
      x.lineTo(x0 + w + j(), y0 + h + j());
      x.lineTo(x0 + j(), y0 + h + j());
      x.closePath();
      x.stroke();
    }
  };
  rough(10, 10, W - 20, H - 20, 2);
  // the gun: simple outlined shapes, muzzle to the right (pixels; the board is 512 x 256)
  const shapes: Record<WeaponId, [number, number, number, number][]> = {
    rifle: [[70, 92, 120, 34], [190, 86, 120, 44], [310, 98, 130, 18], [440, 102, 30, 10], [215, 130, 26, 60], [270, 130, 22, 42], [230, 70, 60, 16]],
    pistol: [[170, 86, 190, 36], [180, 122, 130, 18], [190, 140, 44, 74]],
    shotgun: [[60, 100, 140, 34], [200, 92, 110, 36], [310, 94, 160, 16], [300, 112, 120, 18], [215, 128, 24, 34]],
    rpg: [[60, 92, 70, 46], [130, 100, 280, 30], [410, 92, 30, 46], [440, 98, 40, 34], [220, 130, 22, 46], [300, 130, 22, 36], [250, 76, 40, 24]],
  };
  for (const [sx, sy, sw, sh] of shapes[weapon]) rough(sx, sy, sw, sh, 1);
  x.font = `bold 34px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const def = WEAPONS[weapon];
  x.fillText(def.short, W / 2, 38);
  x.fillText(`$${WALL_PRICES[weapon]}`, W / 2, H - 40);
  // grain: rub out flecks so it reads as chalk
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) x.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2);
  x.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
