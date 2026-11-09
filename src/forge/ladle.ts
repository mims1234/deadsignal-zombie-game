/**
 * The Crucible's ladle, as a trap: throw the lever on the south wall and the bucket tips, flooding the middle of the
 * hall with molten iron for a few seconds. Whatever stands in it burns - the infected, the Infernus (less: its plating
 * was made for this), and you. Then the iron crusts over and the ladle takes a while to fill again.
 *
 * Solo only: a co-op run's infected live in the simulation, which does not know the ladle (there it only hangs and glows).
 */
import * as THREE from 'three';
import { spendCash } from '../logic/economy';
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';

export const LADLE = {
  cost: 750,
  /** Seconds the lever is held. */
  hold: 0.9,
  /** Seconds from the lever to the iron reaching the floor, the flood, and the crust cooling after. */
  tip: 1.1,
  pour: 8,
  cool: 5,
  /** Seconds to refill, from the moment it is thrown. */
  cooldown: 75,
  /** Damage per tick (every `tick` seconds) to the infected, to the boss, and to you. */
  tick: 0.25,
  damage: 60,
  bossDamage: 26,
  playerDamage: 14,
  reach: 2.2,
} as const;

type Phase = 'ready' | 'tipping' | 'pouring' | 'cooling' | 'filling';

export class LadleTrap {
  phase: Phase = 'ready';
  private t = 0;
  private since = 0;
  private tickT = 0;
  private fxT = 0;
  private readonly at = new THREE.Vector3();

  constructor(private readonly g: Game) {}

  reset(): void {
    this.phase = 'ready';
    this.t = 0;
    this.since = 0;
    this.pose(0, 0, 0);
  }

  /** Seconds until it can be thrown again (0 when ready). */
  get wait(): number {
    return this.phase === 'ready' ? 0 : Math.max(0, LADLE.cooldown - this.since);
  }

  target(out: InteractionTarget[], solo: boolean): void {
    const h = this.g.level.forgeFx?.ladle;
    if (!h || !solo) return;
    const p = this.g.player;
    const d = Math.hypot(h.leverX - p.x, h.leverZ - p.z);
    if (d > LADLE.reach) return;
    // from inside the hall: the wall the lever is on is within reach from the street side too
    if (this.g.level.world.segmentBlocked(p.x, 1.2, p.z, h.leverX, 1.2, h.leverZ, 'shots')) return;
    if (this.phase !== 'ready') {
      const pouring = this.phase === 'tipping' || this.phase === 'pouring';
      out.push({ id: 'ladle-wait', dist: d, text: pouring ? 'THE LADLE IS POURING' : 'THE LADLE IS FILLING', sub: pouring ? 'Stay off the floor' : `Ready again in ${Math.ceil(this.wait)} s`, tone: 'warn', hold: 0, enabled: false, onUse: () => {} });
      return;
    }
    const cash = this.g.session.inv.cash;
    const can = cash >= LADLE.cost;
    out.push({
      id: 'ladle',
      dist: d,
      text: `TIP THE LADLE  $${LADLE.cost}`,
      sub: can ? `Molten iron floods the middle of the Crucible for ${LADLE.pour} seconds - keep off it` : `You need $${LADLE.cost}`,
      tone: can ? 'warn' : 'danger',
      hold: LADLE.hold,
      enabled: can,
      onUse: () => this.tip(),
    });
  }

  private tip(): void {
    const g = this.g;
    const h = g.level.forgeFx?.ladle;
    if (!h || this.phase !== 'ready' || !spendCash(g.session.inv, LADLE.cost)) {
      g.audio.play('buy_denied', { volume: 0.7, priority: 1 });
      return;
    }
    this.phase = 'tipping';
    this.t = 0;
    this.since = 0;
    this.tickT = 0;
    this.at.set(h.x, h.lipY, h.z);
    g.audio.play('buy_ok', { volume: 0.6, priority: 1 });
    g.audio.play('klaxon', { pos: this.at, volume: 0.9, priority: 2 });
    g.audio.play('amb_creak', { pos: this.at, volume: 1, rate: 0.6, priority: 1 });
    // the noise brings them in, onto the floor
    g.zombies.emitNoise(h.x, h.z, 40);
  }

  update(dt: number): void {
    const g = this.g;
    const h = g.level.forgeFx?.ladle;
    if (!h || this.phase === 'ready' || dt <= 0) return;
    this.t += dt;
    this.since += dt;
    if (this.phase === 'tipping') {
      const k = Math.min(1, this.t / LADLE.tip);
      this.pose(k, 0, 0);
      if (k >= 1) {
        this.phase = 'pouring';
        this.t = 0;
        g.audio.play('flare_ignite', { pos: this.at, volume: 1.2, rate: 0.7, priority: 2 });
        g.audio.play('warden_slam', { pos: this.at, volume: 0.6, rate: 1.3, priority: 1 });
      }
    } else if (this.phase === 'pouring') {
      const flood = Math.min(1, this.t / 1.4);
      this.pose(1, flood, 1);
      this.burn(dt, h.x, h.z, h.radius * flood);
      this.fxT -= dt;
      if (this.fxT <= 0) {
        this.fxT = 0.12;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * h.radius * flood;
        g.fx.sparkle({ x: h.x + Math.cos(a) * r, y: 0.15, z: h.z + Math.sin(a) * r }, 0xff7a1a, 5);
        if (Math.random() < 0.5) g.fx.sparkle({ x: h.x, y: 0.3, z: h.z - 1.4 }, 0xffb040, 9);
        if (Math.random() < 0.3) g.fx.dust({ x: h.x + Math.cos(a) * r, y: 0.4, z: h.z + Math.sin(a) * r }, 0.6);
      }
      if (this.t >= LADLE.pour) {
        this.phase = 'cooling';
        this.t = 0;
        g.audio.play('amb_clang', { pos: this.at, volume: 0.9, rate: 0.7, priority: 1 });
      }
    } else if (this.phase === 'cooling') {
      const k = Math.min(1, this.t / LADLE.cool);
      // the bucket rights itself; the iron on the floor crusts over, still hot enough to hurt for the first second
      this.pose(1 - Math.min(1, this.t / 1.6), 1, 1 - k);
      if (this.t < 1) this.burn(dt, h.x, h.z, h.radius);
      if (k >= 1) {
        this.phase = 'filling';
        this.pose(0, 0, 0);
      }
    } else if (this.since >= LADLE.cooldown) {
      this.phase = 'ready';
      this.pose(0, 0, 0); // the lever back up
      g.audio.play('objective_ping', { pos: this.at, volume: 0.6, priority: 0 });
    }
  }

  private burn(dt: number, x: number, z: number, radius: number): void {
    this.tickT -= dt;
    if (this.tickT > 0) return;
    this.tickT = LADLE.tick;
    const g = this.g;
    const r2 = radius * radius;
    for (const zb of [...g.zombies.zombies]) {
      if (!zb.active || zb.hp <= 0) continue;
      const dx = zb.x - x;
      const dz = zb.z - z;
      if (dx * dx + dz * dz > r2) continue;
      const boss = zb.type === 'warden';
      g.zombies.damage(zb, boss ? LADLE.bossDamage : LADLE.damage, false, g.zenv, Math.atan2(-dx, -dz), 0);
      if (Math.random() < 0.35) g.fx.sparkle({ x: zb.x, y: 0.9, z: zb.z }, 0xff6a14, 4);
    }
    const p = g.player;
    if (g.playerAlive() && p.y < 0.6 && (p.x - x) ** 2 + (p.z - z) ** 2 < r2) g.hurtPlayer(LADLE.playerDamage, x, z, {});
  }

  /** `tilt` 0..1 the bucket, `flood` 0..1 how far the iron has spread, `heat` 0..1 how hot it still is. */
  private pose(tilt: number, flood: number, heat: number): void {
    const h = this.g.level.forgeFx?.ladle;
    if (!h) return;
    const e = tilt * tilt * (3 - 2 * tilt);
    h.bucket.rotation.x = e * 1.25;
    h.lever.rotation.x = -0.6 + 1.2 * (this.phase === 'ready' ? 0 : 1);
    h.stream.visible = this.phase === 'pouring';
    h.spill.visible = flood > 0 && heat > 0.001;
    h.spill.scale.setScalar(Math.max(0.001, flood));
    h.spillGlow.value = heat;
  }
}
