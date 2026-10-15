/**
 * The Forge's story operation as rules and plain state (no THREE, no DOM), run by whoever simulates the run: the solo
 * game, or the co-op simulation (`sim/serverHost.ts`). Every client shows it from its state (`runtime.ts`), so a solo
 * run and a co-op run play the same.
 *
 *   holdouts  barricaded into rooms; once nothing is on its feet at a door, a hold of E there and they slip out the
 *             back to the Hearth, where each takes a spot (tomoe's vault opens when the beacon burns)
 *   siege     the infected at the doors (`siege.ts`)
 *   furnaces  the seven foundries around the Forge, one per ember: stoke the forge inside, hold the hall while a horde
 *             comes for it, until it catches
 *   ledger    four pages to pick up
 *   rumble    riry's bell: three waves in the Rumble Pit
 *   sentry    the Hearth's gun: it covers the courtyard and its gate (never a boss)
 *   assault   from the extraction call until the burnout, the infected come for the Hearth (`assault.ts`)
 *   finale    a while into the assault the member hiding a bite convulses, glows and is reborn; while it lives the
 *             helicopter holds off and the Hearth loses someone every few seconds (never everyone); when it dies the
 *             virus burns out
 */
import { FORGE_SQUAD, FORGE_STORY, ZOMBIES, type ZombieDef } from '../config';
import type { Zombie, ZombieEnv } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { NavGrid } from '../world/nav';
import { AssaultDirector, type HearthTarget } from './assault';
import { type ForgeRoster, type HoldoutDef, pickForgeRoster, rankOrder } from './roster';
import { SiegeDirector } from './siege';
import type { ForgeSites } from './sites';

export type HoldoutPhase = 'room' | 'hearth' | 'fallen' | 'reborn';
export const HOLDOUT_PHASES: readonly HoldoutPhase[] = ['room', 'hearth', 'fallen', 'reborn'];

export interface HoldoutState extends HoldoutDef {
  phase: HoldoutPhase;
  /** Their spot at the Hearth (-1 until they get there). */
  slot: number;
}

export type RumblePhase = 'idle' | 'wave' | 'gap' | 'done';
export const RUMBLE_PHASES: readonly RumblePhase[] = ['idle', 'wave', 'gap', 'done'];

/** idle -> armed (the turn is set for later) -> warning (the carrier convulses) -> reborn -> burnout (the virus ends). */
export type FinalePhase = 'idle' | 'armed' | 'warning' | 'reborn' | 'burnout';
export const FINALE_PHASES: readonly FinalePhase[] = ['idle', 'armed', 'warning', 'reborn', 'burnout'];

export type FurnacePhase = 'cold' | 'burning' | 'lit';
export const FURNACE_PHASES: readonly FurnacePhase[] = ['cold', 'burning', 'lit'];

export interface FurnaceState {
  /** Which foundry (`sites.furnaces`). */
  spot: number;
  /** Which ember it gives (`FORGE_SQUAD.flames`). */
  flame: number;
  phase: FurnacePhase;
  /** 0..1 while it catches. */
  progress: number;
}

export type AssaultPhase = 'idle' | 'on' | 'over';
export const ASSAULT_PHASES: readonly AssaultPhase[] = ['idle', 'on', 'over'];

/** What every client shows (the co-op snapshot carries it; see `net.ts`). */
export interface ForgeView {
  squad: string[];
  holdouts: HoldoutState[];
  ledger: boolean[];
  rumble: { phase: RumblePhase; wave: number };
  /** `carrier` is -1 until the turn (nobody may know before). */
  finale: { phase: FinalePhase; carrier: number };
  furnaces: FurnaceState[];
  /** The sentry's aim, a count of its shots, and where the last one went. */
  sentry: { yaw: number; shots: number; tx: number; tz: number };
  assault: AssaultPhase;
}

/** What the run looks like to the story this frame. */
export interface StoryTick {
  elapsed: number;
  defenseDone: boolean;
  huntDone: boolean;
  /** When the extraction was called (null: not yet). */
  calledAt: number | null;
  /** Players who can be seen / hunted (alive), and how many are in the session at all. */
  players: readonly { x: number; z: number; alive: boolean; eyeY: number }[];
  playerCount: number;
  /** The environment of the nearest player to (x, z): what the reborn hunts, and what a burnout kill is credited to. */
  envNear(x: number, z: number): ZombieEnv | null;
  /** Can any player see (x, z)? (The siege only grows out of sight.) */
  seen(x: number, z: number): boolean;
}

/** The reborn: the carrier, grown huge and burning, with the Infernus's strength and its own fury. */
export function rebornDef(name: string): ZombieDef {
  const w = ZOMBIES.warden;
  return { ...w, name: `${name.toUpperCase()} - REBORN`, hp: FORGE_STORY.finale.hp, speedChase: w.speedChase * 1.25, damage: w.damage * 1.1, reward: 1500, headshotBonus: 300, sightRange: 70, poise: 650 };
}

const SENTRY_Y = 1.55;

export class ForgeStory {
  readonly siege: SiegeDirector;
  readonly assault: AssaultDirector;
  view: ForgeView = ForgeStory.empty();
  /** Index into the holdouts of the member hiding a bite (the simulation's secret until the turn). */
  private carrier = -1;
  private finaleAt = 0;
  private finaleT = 0;
  private killT = 0;
  reborn: Zombie | null = null;
  private rebornAt = { x: 0, z: 0 };
  private burnR = 0;
  private rumbleT = 0;
  private readonly rumbleCrowd: Zombie[] = [];
  private nextSlot = 0;
  private drawT: number[] = [];
  private sentryCool = 0;
  private sentryTarget: Zombie | null = null;
  /** True while the burnout is killing: those kills pay nothing and drop nothing. */
  burning = false;
  /** True while the sentry's shot lands (its kills pay nothing either). */
  private sentryFiring = false;
  /** The vault's seals: they drop when the beacon burns. */
  vaultOpen = false;

  constructor(
    readonly sites: ForgeSites,
    private readonly zombies: ZombieManager,
    private readonly nav: NavGrid,
  ) {
    this.siege = new SiegeDirector(sites.rooms, zombies, nav);
    this.assault = new AssaultDirector(sites.hearth, zombies, nav);
    this.assault.onTake = (i) => this.takeAtHearth(i);
  }

  static empty(): ForgeView {
    return { squad: [], holdouts: [], ledger: [], rumble: { phase: 'idle', wave: 0 }, finale: { phase: 'idle', carrier: -1 }, furnaces: [], sentry: { yaw: 0, shots: 0, tx: 0, tz: 0 }, assault: 'idle' };
  }

  /** A fresh run: draw the roster and the furnaces, put everyone in their rooms, the first infected at their doors. */
  reset(rng: Rng): ForgeRoster {
    const roster = pickForgeRoster(rng, this.sites.rooms);
    this.carrier = roster.carrier;
    // the seven foundries, each its own ember
    const count = Math.min(FORGE_STORY.furnaces.count, this.sites.furnaces.length, FORGE_SQUAD.flames.length);
    const h = this.sites.hearth;
    this.view = {
      squad: [...roster.squad],
      holdouts: roster.holdouts.map((d) => ({ ...d, phase: 'room' as HoldoutPhase, slot: -1 })),
      ledger: this.sites.ledger.map(() => false),
      rumble: { phase: 'idle', wave: 0 },
      finale: { phase: 'idle', carrier: -1 },
      furnaces: Array.from({ length: count }, (_, i) => ({ spot: i, flame: i, phase: 'cold' as FurnacePhase, progress: 0 })),
      sentry: { yaw: Math.atan2(-(h.gateX - h.sentryX), -(h.gateZ - h.sentryZ)), shots: 0, tx: h.gateX, tz: h.gateZ },
      assault: 'idle',
    };
    this.drawT = this.view.furnaces.map(() => 0);
    this.finaleAt = this.finaleT = this.killT = this.burnR = this.rumbleT = 0;
    this.nextSlot = 0;
    this.sentryCool = 0;
    this.sentryTarget = null;
    this.reborn = null;
    this.burning = false;
    this.sentryFiring = false;
    this.vaultOpen = false;
    this.rumbleCrowd.length = 0;
    this.assault.reset();
    const occupied = this.sites.rooms.map((_, i) => roster.holdouts.some((x) => x.room === i));
    this.siege.reset(occupied, rng);
    return roster;
  }

  /** Names no infected may carry this run (the people holed up are alive). */
  get reserved(): ReadonlySet<string> {
    return new Set(this.view.holdouts.map((h) => h.name));
  }

  /** The helicopter holds off while the reborn is loose. */
  get holdExtraction(): boolean {
    const f = this.view.finale.phase;
    return f === 'warning' || f === 'reborn';
  }

  /** The virus is over: no more spawns, no more firestorm. */
  get burnedOut(): boolean {
    return this.view.finale.phase === 'burnout';
  }

  /** The director stands down: the assault brings the infected now (or there are none left). */
  get quietDirector(): boolean {
    return this.burnedOut || this.view.assault === 'on';
  }

  /** A kill landing now pays nobody (the burnout, the sentry). */
  get noReward(): boolean {
    return this.burning || this.sentryFiring;
  }

  /** Can someone at (x, z) talk holdout `i` out right now? */
  rescueState(i: number, x: number, z: number): 'ok' | 'far' | 'blocked' | 'sealed' | 'gone' {
    const h = this.view.holdouts[i];
    if (!h || h.phase !== 'room') return 'gone';
    const r = this.sites.rooms[h.room]!;
    if (Math.hypot(x - r.doorX, z - r.doorZ) > FORGE_STORY.doorReach + 1.2) return 'far';
    if (r.vault && !this.vaultOpen) return 'sealed';
    return this.siege.threatsAt(h.room) > 0 ? 'blocked' : 'ok';
  }

  /** Holdout `i` slips out the back to the Hearth (checked: the asker is at a clear door). */
  rescue(i: number, x: number, z: number): boolean {
    if (this.rescueState(i, x, z) !== 'ok') return false;
    const h = this.view.holdouts[i]!;
    h.phase = 'hearth';
    h.slot = this.nextSlot++ % this.sites.hearth.slots.length;
    this.siege.vacate(h.room);
    return true;
  }

  /** Ledger page `i` is taken. */
  takeLedger(i: number, x: number, z: number): boolean {
    const s = this.sites.ledger[i];
    if (!s || this.view.ledger[i] || Math.hypot(s.x - x, s.z - z) > FORGE_STORY.ledger.pickupRadius + 2.5) return false;
    this.view.ledger[i] = true;
    return true;
  }

  /** Where you stand to stoke foundry `i`'s forge (in front of its mouth). */
  furnaceFront(i: number): { x: number; z: number } | null {
    const f = this.view.furnaces[i];
    const s = f ? this.sites.furnaces[f.spot] : undefined;
    return s ? { x: s.x, z: s.z } : null;
  }

  /** Is (x, z) inside foundry `spot`'s hall? */
  inFoundry(spot: number, x: number, z: number): boolean {
    const s = this.sites.furnaces[spot];
    return !!s && x > s.x0 - 0.3 && x < s.x1 + 0.3 && z > s.z0 - 0.3 && z < s.z1 + 0.3;
  }

  /** Furnace `i` is stoked: its circle must now be held while it catches. */
  stoke(i: number, x: number, z: number): boolean {
    const f = this.view.furnaces[i];
    const at = this.furnaceFront(i);
    if (!f || !at || f.phase !== 'cold' || this.burnedOut || Math.hypot(at.x - x, at.z - z) > FORGE_STORY.furnaces.reach + 1.5) return false;
    f.phase = 'burning';
    f.progress = 0;
    this.drawT[i] = 2.5;
    return true;
  }

  /** riry's bell is rung (once a run). */
  ringBell(x: number, z: number, t: StoryTick, rng: Rng): boolean {
    const p = this.sites.rumble;
    if (this.view.rumble.phase !== 'idle' || this.burnedOut || Math.hypot(p.bellX - x, p.bellZ - z) > 3.5) return false;
    this.startWave(0, t, rng);
    return true;
  }

  private startWave(n: number, t: StoryTick, rng: Rng): void {
    const R = this.view.rumble;
    const pit = this.sites.rumble;
    R.phase = 'wave';
    R.wave = n;
    this.rumbleCrowd.length = 0;
    const count = FORGE_STORY.rumble.waves[n] ?? 0;
    for (let k = 0; k < count; k++) {
      const g = pit.gates[k % pit.gates.length]!;
      const x = g.x + (rng.f() - 0.5) * 2.5;
      const z = g.z + (rng.f() - 0.5) * 2.5;
      const v = rng.f();
      const type = n >= 2 && v < 0.18 ? 'armored' : v < 0.45 ? 'runner' : 'shambler';
      const zz = this.zombies.spawn(type, x, z, rng, { hpScale: 1 + 0.12 * n, yaw: Math.atan2(x - pit.x, z - pit.z) });
      const env = t.envNear(x, z);
      if (env) zz.aggro(env.player.x, env.player.z);
      this.rumbleCrowd.push(zz);
    }
  }

  /** Once a simulated frame. */
  tick(dt: number, t: StoryTick, rng: Rng): void {
    if (!this.vaultOpen && t.defenseDone) this.vaultOpen = true;
    if (!this.burnedOut) this.siege.update(dt, t.players, rng, (x, z) => t.seen(x, z)); // the virus is over: nobody comes
    this.stepFurnaces(dt, t, rng);
    this.stepRumble(dt, t, rng);
    this.stepAssault(dt, t, rng);
    this.stepSentry(dt, t, rng);
    this.stepFinale(dt, t, rng);
  }

  private stepFurnaces(dt: number, t: StoryTick, rng: Rng): void {
    const F = FORGE_STORY.furnaces;
    this.view.furnaces.forEach((f, i) => {
      if (f.phase !== 'burning') return;
      const s = this.sites.furnaces[f.spot]!;
      if (this.burnedOut) {
        // the virus is over: the fire catches by itself
        f.progress = Math.min(1, f.progress + dt / 4);
      } else {
        const held = t.players.some((p) => p.alive && this.inFoundry(f.spot, p.x, p.z));
        if (held) f.progress = Math.min(1, f.progress + dt / F.hold);
        // the fire draws a horde to the hall, wave after wave, until it catches
        this.drawT[i]! -= dt;
        if (this.drawT[i]! <= 0) {
          this.drawT[i] = F.drawEvery * (0.85 + rng.f() * 0.3);
          const [a, b] = F.draw as readonly [number, number];
          const n = a + Math.floor(rng.f() * (b - a + 1)) + F.drawPerPlayer * Math.max(0, t.playerCount - 1);
          for (let k = 0; k < n; k++) this.drawOne(s.doorX, s.doorZ, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, t, rng);
        }
      }
      if (f.progress >= 1) f.phase = 'lit';
    });
  }

  /** One infected drawn to the fire: from a spot nobody can see, around the hall's door at (x, z), headed inside (hx, hz). */
  private drawOne(x: number, z: number, hx: number, hz: number, t: StoryTick, rng: Rng): void {
    const [d0, d1] = FORGE_STORY.furnaces.drawAway as readonly [number, number];
    for (let k = 0; k < 10; k++) {
      const a = rng.f() * Math.PI * 2;
      const d = d0 + rng.f() * (d1 - d0);
      const sx = x + Math.sin(a) * d;
      const sz = z + Math.cos(a) * d;
      if (this.nav.isBlockedAt(sx, sz) || !this.assault.reachable(sx, sz) || t.seen(sx, sz)) continue;
      const v = rng.f();
      const zz = this.zombies.spawn(v < 0.12 ? 'armored' : v < 0.45 ? 'runner' : 'shambler', sx, sz, rng, { yaw: Math.atan2(sx - x, sz - z) });
      zz.aggro(hx, hz);
      return;
    }
  }

  private stepRumble(dt: number, t: StoryTick, rng: Rng): void {
    const R = this.view.rumble;
    if (R.phase === 'wave') {
      if (this.rumbleCrowd.every((z) => !z.alive || !this.zombies.zombies.includes(z))) {
        if (R.wave + 1 < FORGE_STORY.rumble.waves.length) {
          R.phase = 'gap';
          this.rumbleT = FORGE_STORY.rumble.gap;
        } else R.phase = 'done';
      }
    } else if (R.phase === 'gap') {
      if (this.burnedOut) {
        R.phase = 'done'; // the virus is over: no more waves
        return;
      }
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) this.startWave(R.wave + 1, t, rng);
    }
  }

  /** Who is waiting at the Hearth, and where (the assault's targets). */
  private hearthTargets(): HearthTarget[] {
    const slots = this.sites.hearth.slots;
    const out: HearthTarget[] = [];
    this.view.holdouts.forEach((h, i) => {
      if (h.phase !== 'hearth' || h.slot < 0) return;
      const s = slots[h.slot % slots.length]!;
      out.push({ i, x: s.x, z: s.z });
    });
    return out;
  }

  /** Someone at the Hearth is killed (never the last `finale.keep` of them). */
  private takeAtHearth(i: number): boolean {
    const h = this.view.holdouts[i];
    if (!h || h.phase !== 'hearth') return false;
    if (this.view.holdouts.filter((x) => x.phase === 'hearth').length <= FORGE_STORY.finale.keep) return false;
    h.phase = 'fallen';
    return true;
  }

  private stepAssault(dt: number, t: StoryTick, rng: Rng): void {
    const A = this.assault;
    if (this.view.assault === 'idle' && t.calledAt !== null && !this.burnedOut) {
      this.view.assault = 'on';
      A.start();
    }
    if (this.view.assault === 'on' && this.burnedOut) {
      this.view.assault = 'over';
      A.stop();
    }
    A.update(dt, this.hearthTargets(), t.players, t.playerCount, rng, (x, z) => t.seen(x, z));
  }

  /** The Hearth's gun: the nearest infected in the courtyard or at its gate, never a boss. */
  private stepSentry(dt: number, t: StoryTick, rng: Rng): void {
    const S = FORGE_STORY.sentry;
    const h = this.sites.hearth;
    const view = this.view.sentry;
    this.sentryCool = Math.max(0, this.sentryCool - dt);
    const covered = (z: Zombie): boolean => {
      if (!z.alive || !z.active || z.dormant || z.isBoss) return false;
      if (Math.hypot(z.x - h.sentryX, z.z - h.sentryZ) > S.range) return false;
      if (z.x < h.x0 - 0.4 || z.x > h.x1 + 0.4 || z.z < h.z0 - 0.4) return false;
      if (z.z > h.z1 + 0.4) return Math.abs(z.x - h.gateX) < 3.6 && z.z < h.z1 + 5; // the apron outside the gate
      return true;
    };
    if (!this.sentryTarget || !covered(this.sentryTarget)) {
      this.sentryTarget = null;
      let bd = Infinity;
      for (const z of this.zombies.zombies) {
        if (!covered(z)) continue;
        const d = Math.hypot(z.x - h.sentryX, z.z - h.sentryZ);
        if (d < bd) {
          bd = d;
          this.sentryTarget = z;
        }
      }
    }
    const z = this.sentryTarget;
    if (!z) return;
    const want = Math.atan2(-(z.x - h.sentryX), -(z.z - h.sentryZ));
    let d = want - view.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const m = S.turn * dt;
    view.yaw += Math.max(-m, Math.min(m, d));
    if (Math.abs(d) > 0.18 || this.sentryCool > 0) return;
    const env = t.envNear(h.sentryX, h.sentryZ);
    if (!env) return;
    this.sentryCool = S.fireEvery;
    const head = rng.f() < S.headChance;
    view.shots = (view.shots + 1) % 10000;
    view.tx = z.x;
    view.tz = z.z;
    this.sentryFiring = true;
    this.zombies.damage(z, head ? S.headDamage : S.damage, head, env, want, 0.6);
    this.sentryFiring = false;
    void SENTRY_Y;
  }

  private stepFinale(dt: number, t: StoryTick, rng: Rng): void {
    const F = this.view.finale;
    const F_ = FORGE_STORY.finale;
    const c = this.view.holdouts[this.carrier];
    switch (F.phase) {
      case 'idle':
        if (c && t.huntDone && t.calledAt !== null && (c.phase === 'room' || c.phase === 'hearth')) {
          F.phase = 'armed';
          this.finaleAt = Math.max(t.elapsed, t.calledAt) + F_.delayMin + rng.f() * (F_.delayMax - F_.delayMin);
        }
        return;
      case 'armed':
        if (t.elapsed >= this.finaleAt - F_.warnLead) {
          F.phase = 'warning';
          // from now on everyone may see who it is (they are convulsing, glowing)
          F.carrier = this.carrier;
          this.finaleT = 0;
        }
        return;
      case 'warning':
        this.finaleT += dt;
        if (this.finaleT >= F_.warnLead && c) this.turn(c, t, rng);
        return;
      case 'reborn': {
        const z = this.reborn;
        if (!z || !z.alive || !this.zombies.zombies.includes(z)) {
          F.phase = 'burnout';
          if (z) this.rebornAt = { x: z.x, z: z.z };
          this.burnR = 0;
          return;
        }
        // the longer it lives, the more of the Hearth it takes (the leadership last; never everyone)
        this.killT -= dt;
        if (this.killT <= 0) {
          this.killT = F_.killEvery;
          const left = this.view.holdouts.filter((h) => h.phase === 'hearth');
          if (left.length > F_.keep) {
            left.sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank) || (rng.f() < 0.5 ? -1 : 1));
            left[0]!.phase = 'fallen';
          }
        }
        return;
      }
      case 'burnout':
        this.burnOut(dt, t);
        return;
    }
  }

  /** The carrier is reborn where they stand: at their spot in the Hearth, or breaking out of their room. */
  private turn(c: HoldoutState, t: StoryTick, rng: Rng): void {
    const F = this.view.finale;
    const sites = this.sites;
    let x: number;
    let z: number;
    if (c.phase === 'room') {
      const r = sites.rooms[c.room]!;
      this.siege.vacate(c.room);
      x = r.doorX + r.nx * 1.4;
      z = r.doorZ + r.nz * 1.4;
    } else {
      const s = sites.hearth.slots[Math.max(0, c.slot) % sites.hearth.slots.length]!;
      x = s.x;
      z = s.z + 0.8;
    }
    c.phase = 'reborn';
    F.phase = 'reborn';
    F.carrier = this.view.holdouts.indexOf(c);
    const extra = Math.max(0, t.playerCount - 1) * FORGE_STORY.finale.hpPerPlayer;
    const env = t.envNear(x, z);
    const yaw = env ? Math.atan2(-(env.player.x - x), -(env.player.z - z)) : 0;
    const rig = this.zombies.rebornRig?.(c.name) ?? undefined;
    const zz = this.zombies.spawn('warden', x, z, rng, { boss: true, def: rebornDef(c.name), hpScale: 1 + extra, yaw, rig, oneOff: !!rig });
    this.zombies.tagZombie(zz, c.name, true);
    if (env) zz.aggro(env.player.x, env.player.z);
    this.reborn = zz;
    this.killT = FORGE_STORY.finale.killEvery * 0.6;
  }

  /** The virus ends: every infected left burns out, in a wave rolling out from where the reborn fell. */
  private burnOut(dt: number, t: StoryTick): void {
    this.burnR += dt * 32;
    const o = this.rebornAt;
    this.burning = true;
    for (const z of [...this.zombies.zombies]) {
      if (!z.alive || Math.hypot(z.x - o.x, z.z - o.z) > this.burnR) continue;
      const env = t.envNear(z.x, z.z);
      if (!env) continue;
      this.zombies.damage(z, z.hp + 1e6, false, env, Math.atan2(-(z.x - o.x), -(z.z - o.z)), 1.2, 1.5);
    }
    this.burning = false;
  }
}
