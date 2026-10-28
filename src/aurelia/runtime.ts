/**
 * Aurelia in the game on her own map: the solo game runs her (`brain.ts`), a co-op guest shows the simulation's Aurelia
 * from its reports (`applyWire`). Either way this draws her: the stand-in model in her colours, her wings, the column of
 * fire she rises in, and a red lily wherever she has fallen. What she does is said in one line at a time (the feed, and
 * a radio line the first time), never across the middle of a phone's screen.
 */
import * as THREE from 'three';
import { AURELIA_NPC as N } from '../config';
import { animeModel } from '../anime/vrm';
import { Avatar } from '../coop/avatar';
import type { ZombieEnv } from '../enemies/zombie';
import type { AllyWorld } from '../game/allyBrain';
import type { Game } from '../game/game';
import { AURELIA_PHASES, type Aurelia, type AureliaPhase, type AureliaRow, ashLeft, aureliaAtStart, aureliaHurt, aureliaStep } from './brain';
import { AURELIA_MODEL, AURELIA_TINT, aureliaWings, redLily, risingPillar } from './look';

export class AureliaRuntime {
  /** Her body and brain (solo; a co-op guest keeps one too, moved by the reports). */
  readonly body: Aurelia;
  private readonly avatar: Avatar;
  private readonly wings = aureliaWings();
  private readonly pillar = risingPillar();
  private readonly lilies: { root: THREE.Group; grow(t: number): void; t: number }[] = [];
  private readonly world: AllyWorld;
  private env: ZombieEnv | null = null;
  /** The phase last drawn: a change is what the screen reacts to (solo and co-op alike). */
  private shown: AureliaPhase = 'lead';
  private wingOpen = 0.1;
  private time = 0;
  private toldFall = false;
  /** A co-op guest: the simulation runs her, this only shows her. */
  remote = false;
  /** In this run at all (not in free roam). */
  private active = false;

  constructor(private readonly g: Game) {
    this.body = aureliaAtStart(g.level);
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
      followLeader: (fx, fz, out) => g.flow.follow(fx, fz, out, 10),
    };
    this.avatar = new Avatar('Aurelia', 0, { weapon: 'none', helmet: false, tag: 'UNDYING', tagColor: '#ffb060', look: { female: true, hair: 'long', hairColor: 0xd0302a, skin: 0xf3d6c4, eyes: 0x8a2a1a, accent: 0xd9a441 }, anime: animeModel(AURELIA_MODEL), animeTint: AURELIA_TINT });
    this.avatar.root.add(this.wings.root);
    g.worldRoot.add(this.avatar.root, this.pillar.root);
    this.avatar.root.visible = false;
  }

  /** A new run: she stands beside the insertion point, on her feet, with no lilies yet. Not in free roam. */
  reset(remote: boolean, active: boolean): void {
    this.remote = remote;
    this.active = active;
    Object.assign(this.body, aureliaAtStart(this.g.level));
    this.env = null;
    this.shown = 'lead';
    this.toldFall = false;
    this.wingOpen = 0.1;
    this.burstShown = true;
    for (const l of this.lilies) l.root.removeFromParent();
    this.lilies.length = 0;
    const a = this.body;
    this.avatar.rise();
    this.avatar.set(a.ref.x, a.ref.y, a.ref.z, a.yaw, active);
    this.pillar.update(0, 0);
  }

  /** Her environment for the infected's targeting while she is on her feet (solo), so they hunt her too. */
  envFor(base: ZombieEnv): ZombieEnv | null {
    if (!this.active || this.remote || !this.body.ref.alive) return null;
    this.env ??= { ...base, player: this.body.ref, field: this.body.field, hurtPlayer: (amount, sx, sz) => void aureliaHurt(this.body, amount, sx, sz) };
    this.env.time = base.time;
    this.env.rng = base.rng;
    return this.env;
  }

  /** A co-op report's row: where she is and what she is going through. */
  applyWire(row: unknown): void {
    if (!Array.isArray(row) || row.length < 8) return;
    const [x, z, yaw, ph, left, hp, deaths, y] = row.map(Number) as AureliaRow;
    const a = this.body;
    a.ref.x = x;
    a.ref.z = z;
    a.ref.y = y;
    a.yaw = yaw;
    a.hp = hp;
    a.deaths = deaths;
    a.phase = AURELIA_PHASES[ph] ?? 'lead';
    a.ref.alive = a.phase === 'lead';
    // the row says how long until she rises; while falling that includes the fall itself
    a.ashFor = a.phase === 'fallen' ? Math.max(0, left - N.fall) : left;
    a.phaseT = 0;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.time += dt;
    const a = this.body;
    const g = this.g;
    if (!this.remote) {
      const p = g.player;
      const leader = g.playerAlive() ? { x: p.x, y: p.y, z: p.z, yaw: p.yaw } : null;
      aureliaStep(a, this.world, dt, leader, this.env);
    }
    // ---- what the screen shows follows her phase (the same in solo and for a co-op guest) ----
    if (a.phase !== this.shown) this.enter(a.phase);
    const av = this.avatar;
    if (a.phase === 'lead') av.set(a.ref.x, a.ref.y, a.ref.z, a.yaw, true);
    av.update(dt);
    // the wings ride her back (the figure turns inside the avatar's root): folded close while she walks, spread wide
    // as she rises
    this.wings.root.rotation.y = a.yaw;
    const want = a.phase === 'rising' ? 1 : a.phase === 'lead' ? 0.12 : 0;
    this.wingOpen += (want - this.wingOpen) * Math.min(1, dt * (want > this.wingOpen ? 6 : 1.5));
    this.wings.update(this.wingOpen, this.time);
    // the column of fire through the rising, and the burst partway in
    const intoRise = this.time - this.risingAt;
    const riseT = a.phase === 'rising' ? Math.min(1, intoRise / N.rise) : 0;
    this.pillar.root.position.set(a.ref.x, a.ref.y, a.ref.z);
    this.pillar.update(riseT, this.time);
    if (a.phase === 'rising' && !this.burstShown && intoRise >= N.burstAt) {
      this.burstShown = true;
      this.showBurst();
    }
    for (const l of this.lilies) {
      if (l.t >= 1) continue;
      l.t = Math.min(1, l.t + dt * 0.7);
      l.grow(l.t);
    }
  }

  private risingAt = 0;
  private burstShown = false;

  /** Her phase changed: show it (the fall, the ash, the rising). */
  private enter(phase: AureliaPhase): void {
    const a = this.body;
    const av = this.avatar;
    const g = this.g;
    const prev = this.shown;
    this.shown = phase;
    if (phase === 'fallen' || (phase === 'ash' && prev === 'lead')) {
      av.fall(Math.sin(a.yaw), Math.cos(a.yaw), 1.4);
      this.lily(a.ref.x, a.ref.y, a.ref.z);
      g.audio.play('petal_burst', { pos: { x: a.ref.x, y: a.ref.y + 0.5, z: a.ref.z }, priority: 3 });
      g.feed(`AURELIA FELL - RISES IN ${Math.round(ashLeft(a))} S`, 'warn');
      if (!this.toldFall) {
        this.toldFall = true;
        g.radio('ATHY', "She's down! ...Wait. Look at the ground where she fell.", 4.5);
      }
    } else if (phase === 'ash') {
      av.root.visible = false;
    } else if (phase === 'rising') {
      this.risingAt = this.time;
      this.burstShown = false;
      av.rise();
      av.set(a.ref.x, a.ref.y, a.ref.z, a.yaw, true);
      g.audio.play('flare_ignite', { pos: { x: a.ref.x, y: a.ref.y + 1, z: a.ref.z }, volume: 1, priority: 3 });
      g.feed('AURELIA RISES', 'good');
    }
  }

  /** The fire bursting out of her as she rises (the damage and the knock-back are the brain's, or the simulation's). */
  private showBurst(): void {
    const a = this.body;
    const g = this.g;
    const at = { x: a.ref.x, y: a.ref.y + 1, z: a.ref.z };
    g.fx.explosion(at, N.burst.radius * 0.5);
    g.fx.sparkle(at, 0xffb040, 40);
    g.audio.play('grenade_explosion', { pos: at, volume: 0.7, priority: 3 });
    const d = Math.hypot(g.player.x - a.ref.x, g.player.z - a.ref.z);
    if (d < 14) {
      g.shake(0.35 * (1 - d / 14));
      g.hud.event({ type: 'flash', color: '#ffb060', strength: 0.35 * (1 - d / 14) });
    }
  }

  /** A red lily opens where she fell (the oldest goes when there are too many). */
  private lily(x: number, y: number, z: number): void {
    const l = redLily();
    l.root.position.set(x, y, z);
    l.root.rotation.y = this.time * 1.7;
    this.g.worldRoot.add(l.root);
    this.lilies.push({ ...l, t: 0 });
    while (this.lilies.length > N.lilies) this.lilies.shift()!.root.removeFromParent();
  }

  dispose(): void {
    this.avatar.dispose();
    this.wings.dispose();
    this.pillar.dispose();
    for (const l of this.lilies) l.root.removeFromParent();
    this.lilies.length = 0;
  }
}
