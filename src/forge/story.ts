/**
 * The Forge's story operation as rules and plain state (no THREE, no DOM), run by whoever simulates the run: the solo
 * game, or the co-op simulation (`sim/serverHost.ts`). Every client shows it from its state (`runtime.ts`), so a solo
 * run and a co-op run play the same.
 *
 *   holdouts  barricaded into rooms; once nothing is on its feet at a door, a hold of E there and they slip out the
 *             back to the Hearth (tomoe's vault opens when the beacon burns)
 *   siege     the infected at the doors (`siege.ts`)
 *   ledger    four pages to pick up
 *   rumble    riry's bell: three waves in the Rumble Pit
 *   finale    after the extraction is called, the member hiding a bite is reborn; while it lives the helicopter holds
 *             off and the Hearth loses someone every few seconds (never everyone); when it dies the virus burns out
 */
import { FORGE_STORY, ZOMBIES, type ZombieDef } from '../config';
import type { Zombie, ZombieEnv } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { NavGrid } from '../world/nav';
import { type ForgeRoster, type HoldoutDef, pickForgeRoster, rankOrder } from './roster';
import { SiegeDirector } from './siege';
import type { ForgeSites } from './sites';

export type HoldoutPhase = 'room' | 'hearth' | 'fallen' | 'reborn';
export const HOLDOUT_PHASES: readonly HoldoutPhase[] = ['room', 'hearth', 'fallen', 'reborn'];

export interface HoldoutState extends HoldoutDef {
  phase: HoldoutPhase;
}

export type RumblePhase = 'idle' | 'wave' | 'gap' | 'done';
export const RUMBLE_PHASES: readonly RumblePhase[] = ['idle', 'wave', 'gap', 'done'];

/** idle -> armed (the turn is set for later) -> warning (the radio cuts in) -> reborn -> burnout (the virus ends). */
export type FinalePhase = 'idle' | 'armed' | 'warning' | 'reborn' | 'burnout';
export const FINALE_PHASES: readonly FinalePhase[] = ['idle', 'armed', 'warning', 'reborn', 'burnout'];

/** What every client shows (the co-op snapshot carries it; see `net.ts`). */
export interface ForgeView {
  squad: string[];
  holdouts: HoldoutState[];
  ledger: boolean[];
  rumble: { phase: RumblePhase; wave: number };
  /** `carrier` is -1 until the turn (nobody may know before). */
  finale: { phase: FinalePhase; carrier: number };
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

/** The reborn: the Infernus's frame with the carrier's name, burning hotter. */
export function rebornDef(name: string): ZombieDef {
  const w = ZOMBIES.warden;
  return { ...w, name: `${name.toUpperCase()} - REBORN`, hp: FORGE_STORY.finale.hp, speedChase: w.speedChase * 1.18, damage: w.damage * 1.1, reward: 1500, headshotBonus: 300, sightRange: 70, poise: 650 };
}

export class ForgeStory {
  readonly siege: SiegeDirector;
  view: ForgeView = { squad: [], holdouts: [], ledger: [], rumble: { phase: 'idle', wave: 0 }, finale: { phase: 'idle', carrier: -1 } };
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
  /** True while the burnout is killing: those kills pay nothing and drop nothing. */
  burning = false;
  /** The vault's seals: they drop when the beacon burns. */
  vaultOpen = false;

  constructor(
    readonly sites: ForgeSites,
    private readonly zombies: ZombieManager,
    nav: NavGrid,
  ) {
    this.siege = new SiegeDirector(sites.rooms, zombies, nav);
  }

  /** A fresh run: draw the roster, put everyone in their rooms, the first infected at their doors. */
  reset(rng: Rng): ForgeRoster {
    const roster = pickForgeRoster(rng, this.sites.rooms);
    this.carrier = roster.carrier;
    this.view = {
      squad: [...roster.squad],
      holdouts: roster.holdouts.map((h) => ({ ...h, phase: 'room' as HoldoutPhase })),
      ledger: this.sites.ledger.map(() => false),
      rumble: { phase: 'idle', wave: 0 },
      finale: { phase: 'idle', carrier: -1 },
    };
    this.finaleAt = this.finaleT = this.killT = this.burnR = this.rumbleT = 0;
    this.reborn = null;
    this.burning = false;
    this.vaultOpen = false;
    this.rumbleCrowd.length = 0;
    const occupied = this.sites.rooms.map((_, i) => roster.holdouts.some((h) => h.room === i));
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
    this.stepRumble(dt, t, rng);
    this.stepFinale(dt, t, rng);
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

  /** The carrier is reborn: at the Hearth's gate, or breaking out of their room if they never left it. */
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
      x = sites.hearth.gateX;
      z = sites.hearth.gateZ;
    }
    c.phase = 'reborn';
    F.phase = 'reborn';
    F.carrier = this.view.holdouts.indexOf(c);
    const extra = Math.max(0, t.playerCount - 1) * FORGE_STORY.finale.hpPerPlayer;
    const env = t.envNear(x, z);
    const yaw = env ? Math.atan2(-(env.player.x - x), -(env.player.z - z)) : 0;
    const zz = this.zombies.spawn('warden', x, z, rng, { boss: true, def: rebornDef(c.name), hpScale: 1 + extra, yaw });
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
