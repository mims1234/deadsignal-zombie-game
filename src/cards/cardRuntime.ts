/**
 * Card recovery runtime: places the carriers in the district, floats each one's card over its head, runs the
 * knock-down / purge / pick-up loop, and feeds the HUD (objective, markers, target bar, collection).
 * The rules themselves are in `logic/carriers.ts`; this file is the part that touches the world.
 */
import * as THREE from 'three';
import { CARD_MODE, ZOMBIES, type ZombieDef } from '../config';
import type { Zombie, ZombieEnv } from '../enemies/zombie';
import { ZombieRigImpl } from '../enemies/zombie/rig';
import type { GameCtx } from '../game/ctx';
import {
  type CarrierState,
  createCarrier,
  downCarrier,
  identifyCarrier,
  purgeCarrier,
  recoverCarrier,
  recoveredCount,
  recoveryReward,
  spreadPick,
  tickCarrier,
} from '../logic/carriers';
import { addCash } from '../logic/economy';
import { loadCards, saveCards } from '../storage';
import type { CardCollectionEntry, HudObjective, HudState, MapMarker } from '../ui/hudTypes';
import { createObjectiveBeam } from '../world/models';
import { type CardKit, loadCardKits, makeCardBody, makeFoil } from './cardArt';
import { buildCarrierAssets } from './cosplay';
import { CARRIERS, type CarrierDef, cssColor } from './roster';

interface Unit {
  def: CarrierDef;
  stats: ZombieDef;
  kit: CardKit;
  rig: ZombieRigImpl;
  portrait: THREE.Sprite;
  /** Shrinking ring under a downed carrier: the time left to purge it. */
  ring: THREE.Mesh;
  loot: THREE.Group;
  lootCard: THREE.Group;
  foil: THREE.ShaderMaterial;
  zombie: Zombie | null;
  state: CarrierState | null;
  /** Centre of the search circle drawn on the map before the carrier is identified. */
  hintX: number;
  hintZ: number;
}

const PORTRAIT_H = 0.72;

export class CardRuntime {
  readonly root = new THREE.Group();
  private readonly units: Unit[] = [];
  private owned: string[] = [];
  private passive = false;
  private time = 0;
  private readonly head = new THREE.Vector3();

  constructor(
    private readonly ctx: GameCtx,
    private readonly material: THREE.Material,
    private readonly env: () => ZombieEnv,
  ) {
    this.root.name = 'Cards';
    ctx.worldRoot.add(this.root);
  }

  /** Load the art and build every carrier's model once. */
  async load(): Promise<void> {
    const kits = await loadCardKits(CARRIERS);
    this.owned = loadCards(CARRIERS.map((c) => c.id));
    CARRIERS.forEach((def, i) => {
      const kit = kits.get(def.id)!;
      const rig = new ZombieRigImpl(buildCarrierAssets(def, i), this.material, { radius: 0.3, height: def.height, headRadius: 0.18 }, 77 + i);
      rig.setVisible(false);
      const portrait = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.front, alphaTest: 0.5 }));
      portrait.center.set(0.5, 0);
      portrait.scale.set(PORTRAIT_H * kit.aspect, PORTRAIT_H, 1);
      portrait.visible = false;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1, 48),
        new THREE.MeshBasicMaterial({ color: 0x9dffd0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;

      const loot = new THREE.Group();
      const lootCard = makeCardBody(kit, 1.05, 0.9);
      const foil = makeFoil(kit, def.accent);
      const sheen = new THREE.Mesh((lootCard.children[0] as THREE.Mesh).geometry, foil);
      sheen.position.z = 1.05 * 0.016 * 0.5 + 0.004;
      lootCard.add(sheen);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.68, 48),
        new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.03;
      loot.add(lootCard, halo, createObjectiveBeam(def.accent));
      loot.visible = false;
      this.root.add(portrait, ring, loot);

      const base = ZOMBIES[def.base];
      const stats: ZombieDef = { ...base, name: def.name, hp: def.hp, speedChase: def.speedChase, damage: def.damage, bodyMul: def.bodyMul, poise: def.poise, radius: 0.3, height: def.height, headRadius: 0.18, sightRange: 30, reward: 0, headshotBonus: 0, dropChance: 0 };
      this.units.push({ def, stats, kit, rig, portrait, ring, loot, lootCard, foil, zombie: null, state: null, hintX: 0, hintZ: 0 });
    });
  }

  /**
   * Start a run. `enabled` puts the carriers in the district; `passive` (free roam) leaves them standing around
   * with no side contract attached. Call after the regular population has been (re)built.
   */
  reset(enabled: boolean, passive: boolean): void {
    const ctx = this.ctx;
    this.passive = passive;
    for (const u of this.units) {
      if (u.zombie && ctx.zombies.zombies.includes(u.zombie)) ctx.zombies.remove(u.zombie);
      u.zombie = null;
      u.state = null;
      u.portrait.visible = false;
      u.ring.visible = false;
      u.loot.visible = false;
      u.rig.setVisible(false);
    }
    ctx.session.carriers = [];
    if (!enabled || this.units.length === 0) return;

    const data = ctx.level.data;
    const far = (p: { x: number; z: number }, x: number, z: number, d: number): boolean => Math.hypot(p.x - x, p.z - z) > d;
    let spots = data.ambient.filter(
      (a) =>
        far(a, data.playerStart.x, data.playerStart.z, CARD_MODE.minStartDistance) &&
        far(a, data.extraction.lzX, data.extraction.lzZ, 28) &&
        far(a, data.hunt.wardenX, data.hunt.wardenZ, 42) &&
        far(a, data.defense.x, data.defense.z, data.defense.radius + 8),
    );
    if (spots.length < this.units.length) spots = data.ambient;
    const rand = (): number => ctx.rng.f();
    const picks = spreadPick(spots, this.units.length, rand);
    // deal the carriers out to the spots in a random order
    const order = this.units.map((_, i) => i).sort(() => rand() - 0.5);
    picks.forEach((spotIndex, n) => {
      const u = this.units[order[n]!]!;
      const spot = spots[spotIndex]!;
      const at = ctx.level.nav.randomFreeNear(spot.x, spot.z, 3, rand) ?? spot;
      u.zombie = ctx.zombies.spawn(u.def.base, at.x, at.z, ctx.rng, { ambient: true, rig: u.rig, def: u.stats, curable: true });
      const a = rand() * Math.PI * 2;
      u.hintX = at.x + Math.cos(a) * 9;
      u.hintZ = at.z + Math.sin(a) * 9;
      if (!passive) {
        u.state = createCarrier(u.def.id);
        ctx.session.carriers.push(u.state);
      }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // per-frame update
  // ---------------------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    const p = ctx.player;
    const s = ctx.session;
    this.time += dt;
    const live = !this.passive && ctx.playerAlive() && !s.ended;
    if (live && s.carriers.length > 0 && s.elapsed > 12 && !s.flags.has('cardBrief')) {
      s.flags.add('cardBrief');
      ctx.radio('COMMAND', 'One more thing. Five archive cards went missing in the sector, and the signal has grown a body around each of them. Put a carrier down, purge it, and bring the card home.', 8);
    }
    for (const u of this.units) {
      const z = u.zombie;
      const st = u.state;
      if (z) {
        z.rig.getHeadWorld(this.head);
        u.portrait.visible = !z.dormant;
        u.portrait.position.set(this.head.x, this.head.y + (z.state === 'downed' ? 0.55 : 0.34) + Math.sin(this.time * 2 + u.hintX) * 0.02, this.head.z);
        if (st && live) {
          const dist = Math.hypot(z.x - p.x, z.z - p.z);
          if (identifyCarrier(st, dist)) this.onIdentified(u);
          if (z.state === 'downed' && downCarrier(st)) this.onDowned(u);
          if (tickCarrier(st, dt)) {
            z.revive(CARD_MODE.reviveHp, this.env());
            ctx.feed(`${u.def.name.toUpperCase()} IS BACK ON HER FEET`, 'warn');
            ctx.audio.play('klaxon', { priority: 2, volume: 0.4 });
          }
        }
        const down = st?.phase === 'downed';
        u.ring.visible = down;
        if (down) {
          u.ring.position.set(z.x, 0.04, z.z);
          u.ring.scale.setScalar(0.5 + 1.1 * (st.downLeft / CARD_MODE.downTime));
        }
      }
      if (st?.phase === 'purged') {
        u.lootCard.position.y = 0.5 + Math.sin(this.time * 1.6) * 0.07;
        u.lootCard.rotation.y = this.time * 1.1;
        u.foil.uniforms.uTime!.value = this.time;
        if (live && Math.hypot(u.loot.position.x - p.x, u.loot.position.z - p.z) < CARD_MODE.pickupRadius) this.pickUp(u, st);
      }
    }
  }

  private onIdentified(u: Unit): void {
    const ctx = this.ctx;
    ctx.banner('CARD SIGNAL', `${u.def.name.toUpperCase()}  -  ${u.def.series}`, 'warn', 3.5);
    ctx.audio.play('objective_ping', { priority: 2 });
    if (!ctx.session.flags.has('cardFirst')) {
      ctx.session.flags.add('cardFirst');
      ctx.radio('COMMAND', "That's a carrier. It will not die - drop it, then get close and purge it before it gets back up.", 6);
    }
  }

  private onDowned(u: Unit): void {
    const ctx = this.ctx;
    ctx.banner(`${u.def.name.toUpperCase()} IS DOWN`, `Purge the signal within ${CARD_MODE.downTime} seconds`, 'good', 3.5);
    ctx.feed(`${u.def.name.toUpperCase()} DOWN`, 'good');
    ctx.audio.play('objective_ping', { priority: 3 });
  }

  private pickUp(u: Unit, st: CarrierState): void {
    const ctx = this.ctx;
    const s = ctx.session;
    if (!recoverCarrier(st)) return;
    u.loot.visible = false;
    if (!this.owned.includes(u.def.id)) {
      this.owned.push(u.def.id);
      saveCards(this.owned);
    }
    const cash = recoveryReward(s.carriers);
    addCash(s.inv, cash);
    const got = recoveredCount(s.carriers);
    const total = s.carriers.length;
    ctx.hudEvent({ type: 'cash', amount: cash });
    ctx.hudEvent({ type: 'card', name: u.def.name, series: u.def.series, image: u.kit.url, accent: cssColor(u.def.accent), count: got, total });
    ctx.feed(`CARD RECOVERED  +$${cash}`, 'good');
    ctx.audio.play('contract_complete', { priority: 3 });
    ctx.fx.sparkle({ x: u.loot.position.x, y: 1, z: u.loot.position.z }, u.def.accent, 22);
    if (got === total) {
      ctx.banner('ALL CARDS RECOVERED', `Full set bonus  +$${CARD_MODE.allBonus.toLocaleString('en-US')}`, 'good', 5);
      ctx.radio('COMMAND', 'That is the whole archive. Outstanding. Now get yourself out of there.');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // interaction
  // ---------------------------------------------------------------------------------------------

  /** The downed carrier within reach, if any. */
  cureTarget(): { id: string; name: string; dist: number } | null {
    const p = this.ctx.player;
    let best: { id: string; name: string; dist: number } | null = null;
    for (const u of this.units) {
      if (u.state?.phase !== 'downed' || !u.zombie) continue;
      const dist = Math.hypot(u.zombie.x - p.x, u.zombie.z - p.z);
      if (dist <= CARD_MODE.cureReach && (!best || dist < best.dist)) best = { id: u.def.id, name: u.def.name, dist };
    }
    return best;
  }

  /** Administer the counter-agent: the body comes apart and the card is left behind. */
  cure(id: string): void {
    const ctx = this.ctx;
    const u = this.units.find((q) => q.def.id === id);
    const z = u?.zombie;
    if (!u || !z || !u.state || !purgeCarrier(u.state)) return;
    for (const y of [0.3, 0.8, 1.3]) ctx.fx.sparkle({ x: z.x, y, z: z.z }, y > 1 ? 0xffffff : u.def.accent, 18);
    ctx.audio.play('upgrade_ok', { priority: 3 });
    ctx.hudEvent({ type: 'flash', color: cssColor(u.def.accent), strength: 0.35 });
    ctx.feed(`${u.def.name.toUpperCase()} PURGED - TAKE THE CARD`, 'good');
    u.loot.position.set(z.x, 0, z.z);
    u.loot.visible = true;
    u.portrait.visible = false;
    u.ring.visible = false;
    ctx.zombies.remove(z);
    u.zombie = null;
  }

  // ---------------------------------------------------------------------------------------------
  // HUD data
  // ---------------------------------------------------------------------------------------------

  private distTo(u: Unit): number {
    const p = this.ctx.player;
    if (u.state?.phase === 'purged') return Math.hypot(u.loot.position.x - p.x, u.loot.position.z - p.z);
    if (u.zombie) return Math.hypot(u.zombie.x - p.x, u.zombie.z - p.z);
    return Infinity;
  }

  /** The unit the side contract currently points at: a card on the ground, then a downed carrier, then the nearest known one. */
  private focus(): Unit | null {
    const rank = (u: Unit): number => (u.state?.phase === 'purged' ? 0 : u.state?.phase === 'downed' ? 1 : u.state?.phase === 'identified' ? 2 : 9);
    let best: Unit | null = null;
    for (const u of this.units) {
      if (rank(u) > 2) continue;
      if (!best || rank(u) < rank(best) || (rank(u) === rank(best) && this.distTo(u) < this.distTo(best))) best = u;
    }
    return best;
  }

  /** Append the side contract to the objective list (nothing outside card recovery). */
  objectives(out: HudObjective[]): void {
    const list = this.ctx.session.carriers;
    if (list.length === 0) return;
    const got = recoveredCount(list);
    const f = this.focus();
    let detail = `Find the carriers - ${list.length - got} signals in the district`;
    if (got === list.length) detail = 'Every card recovered';
    else if (f?.state?.phase === 'purged') detail = `Pick up ${f.def.name}'s card`;
    else if (f?.state?.phase === 'downed') detail = `${f.def.name} is down - purge the signal (${Math.ceil(f.state.downLeft)}s)`;
    else if (f) detail = `Put ${f.def.name} down, then purge the signal`;
    out.push({
      id: 'cards',
      title: `RECOVER THE CARDS  ${got}/${list.length}`,
      detail,
      state: got === list.length ? 'complete' : 'active',
      progress: got / list.length,
      tracked: false,
      distance: f && got < list.length ? this.distTo(f) : -1,
    });
  }

  markers(out: MapMarker[]): void {
    for (const u of this.units) {
      const st = u.state;
      if (!st || st.phase === 'recovered') continue;
      const color = cssColor(u.def.accent);
      if (st.phase === 'purged') {
        out.push({ id: `card:${u.def.id}`, kind: 'objective', x: u.loot.position.x, z: u.loot.position.z, label: 'CARD', color, visible: true, compass: true, pulse: true });
      } else if (st.phase === 'roaming' || !u.zombie) {
        out.push({ id: `card:${u.def.id}`, kind: 'hunt', x: u.hintX, z: u.hintZ, label: 'SIGNAL', color, radius: 20, visible: true, compass: false, dim: true });
      } else {
        out.push({ id: `card:${u.def.id}`, kind: 'hunt', x: u.zombie.x, z: u.zombie.z, label: u.def.name.toUpperCase(), color, visible: true, compass: true, pulse: st.phase === 'downed' });
      }
    }
  }

  /** Target bar for the carrier the player is fighting (or standing over). */
  bossInfo(): HudState['boss'] {
    let best: Unit | null = null;
    for (const u of this.units) {
      const z = u.zombie;
      if (!z || !u.state || u.state.phase === 'roaming') continue;
      if (z.state !== 'downed' && !z.chasing) continue;
      if (this.distTo(u) > 45) continue;
      if (!best || this.distTo(u) < this.distTo(best)) best = u;
    }
    if (!best?.zombie) return null;
    const z = best.zombie;
    const down = z.state === 'downed';
    return { name: best.def.name.toUpperCase(), fraction: down ? 0 : z.hp / z.maxHp, enraged: false, portrait: best.kit.url, accent: cssColor(best.def.accent), note: down ? 'DOWN - PURGE' : undefined };
  }

  /** Every card and whether it has ever been recovered (title screen). */
  collection(): CardCollectionEntry[] {
    return this.units.map((u) => ({ id: u.def.id, name: u.def.name, series: u.def.series, image: u.kit.url, accent: cssColor(u.def.accent), owned: this.owned.includes(u.def.id) }));
  }
}
