/**
 * Aurelia as an NPC (`AURELIA_NPC` in config), shared by the solo game (`runtime.ts`) and the co-op session simulation
 * (`sim/serverHost.ts`): she walks a little ahead of whoever she follows, the infected hunt her like anyone else, and she
 * cannot die. Killed, she falls, lies in the ash, and rises in a burst of fire. No drawing and no sound here: the caller
 * is told what happened (`AureliaEvent`) and shows it.
 *
 *   lead     on her feet: following (and so leading, a few steps ahead), hunted, hurt
 *   fallen   the blow has just landed: she goes down where she stood
 *   ash      lying in the ash, `ashFor` seconds (longer for every death in a row); infected on the ash hold her down
 *   rising   back on her feet in fire: the burst throws back everything near her, then she leads again
 */
import { AURELIA_NPC as N } from '../config';
import type { ZombieEnv } from '../enemies/zombie';
import { type AllyBody, type AllyWorld, allyMove, allyRecover, makeAllyBody } from '../game/allyBrain';
import type { Level } from '../world/level';
import { GAMEPLAY_FIELD_RANGE } from '../world/nav';

export type AureliaPhase = 'lead' | 'fallen' | 'ash' | 'rising';
/** On the wire, a phase is its index here. */
export const AURELIA_PHASES: readonly AureliaPhase[] = ['lead', 'fallen', 'ash', 'rising'];

export interface Aurelia extends AllyBody {
  phase: AureliaPhase;
  /** Seconds into the phase (in the ash, held back by anyone standing on it). */
  phaseT: number;
  /** How long this time in the ash lasts. */
  ashFor: number;
  /** Deaths in a row (since she last stood `forgiveAfter` seconds). */
  deaths: number;
  /** Seconds on her feet since she last rose. */
  upT: number;
  /** The rising's burst has gone off. */
  burst: boolean;
}

export type AureliaEvent = { kind: 'fell'; deaths: number; ashFor: number } | { kind: 'rose' } | { kind: 'burst'; kills: number };

/** Someone to follow: where they are and which way they face. */
export interface AureliaLeader {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Aurelia, standing at (x, z) facing `yaw`. */
export function makeAurelia(level: Level, x: number, z: number, yaw: number): Aurelia {
  const a = makeAllyBody(level, 'Aurelia', 'survivor', x, z, yaw, { ...N.slot }, false, 0);
  a.stats = { ...a.stats, hp: N.hp, damageTaken: 1 };
  a.hp = N.hp;
  return { ...a, phase: 'lead', phaseT: 0, ashFor: 0, deaths: 0, upT: 0, burst: false };
}

/** Aurelia where a run starts: in her place ahead of the insertion point, facing the way the player does. */
export function aureliaAtStart(level: Level): Aurelia {
  const st = level.data.playerStart;
  const c = Math.cos(st.yaw);
  const s = Math.sin(st.yaw);
  return makeAurelia(level, st.x + N.slot.x * c + N.slot.z * s, st.z - N.slot.x * s + N.slot.z * c, st.yaw);
}

/** On the wire (`au` in a co-op report): [x, z, yaw, phase index, seconds until she rises, hp, deaths in a row, y]. */
export type AureliaRow = [number, number, number, number, number, number, number, number];

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Her state for a co-op report. */
export function aureliaRow(a: Aurelia): AureliaRow {
  return [r1(a.ref.x), r1(a.ref.z), r2(a.yaw), AURELIA_PHASES.indexOf(a.phase), r1(ashLeft(a)), Math.round(a.hp), a.deaths, r1(a.ref.y)];
}

/** Seconds in the ash after the `deaths`th death in a row. */
export function ashTime(deaths: number): number {
  return Math.min(N.ashMax, N.ashFirst * N.ashGrowth ** Math.max(0, deaths - 1));
}

/** A blow from (sx, sz). Only lands while she is on her feet; returns the fall when it kills her. */
export function aureliaHurt(a: Aurelia, amount: number, sx: number, sz: number): AureliaEvent | null {
  if (a.phase !== 'lead' || !a.ref.alive) return null;
  a.hp -= amount * a.stats.damageTaken;
  a.sinceHurt = 0;
  if (a.hp > 0) return null;
  a.hp = 0;
  a.ref.alive = false;
  // facing the blow: she falls away from it
  a.yaw = Math.atan2(-(sx - a.ref.x), -(sz - a.ref.z));
  a.target = null;
  if (a.upT > N.forgiveAfter) a.deaths = 0;
  a.deaths++;
  a.ashFor = ashTime(a.deaths);
  a.phase = 'fallen';
  a.phaseT = 0;
  a.upT = 0;
  return { kind: 'fell', deaths: a.deaths, ashFor: a.ashFor };
}

/** Seconds left before she rises (0 unless she is down). */
export function ashLeft(a: Aurelia): number {
  if (a.phase === 'fallen') return a.ashFor + N.fall - a.phaseT;
  if (a.phase === 'ash') return Math.max(0, a.ashFor - a.phaseT);
  return 0;
}

/**
 * One step: follow `leader` while she is up; count down the fall and the ash; rise, burst and stand. `env` is hers
 * (whose the burst's kills are). Returns what happened, if anything.
 */
export function aureliaStep(a: Aurelia, w: AllyWorld, dt: number, leader: AureliaLeader | null, env: ZombieEnv | null): AureliaEvent | null {
  a.phaseT += dt;
  switch (a.phase) {
    case 'lead': {
      a.upT += dt;
      allyRecover(a, dt);
      a.fieldT -= dt;
      if (a.fieldT <= 0) {
        a.field.compute(a.ref.x, a.ref.z, GAMEPLAY_FIELD_RANGE);
        a.fieldT = 1;
      }
      if (leader) allyMove(a, w, dt, leader.x, leader.z, leader.yaw, leader.y);
      return null;
    }
    case 'fallen':
      if (a.phaseT >= N.fall) {
        a.phase = 'ash';
        a.phaseT = 0;
      }
      return null;
    case 'ash': {
      // the infected standing on her ashes hold her down
      let on = 0;
      for (const z of w.zombies.zombies) if (z.active && Math.hypot(z.x - a.ref.x, z.z - a.ref.z) < N.trample.radius) on++;
      a.phaseT -= dt * Math.min(N.trample.max, on * N.trample.per);
      if (a.phaseT < a.ashFor) return null;
      a.phase = 'rising';
      a.phaseT = 0;
      a.burst = false;
      return { kind: 'rose' };
    }
    case 'rising': {
      if (!a.burst && a.phaseT >= N.burstAt) {
        a.burst = true;
        const kills = env ? w.zombies.explode(a.ref.x, a.ref.y + 1, a.ref.z, N.burst.radius, N.burst.center, N.burst.edge, 0, env, N.burst.knock) : 0;
        return { kind: 'burst', kills };
      }
      if (a.phaseT >= N.rise) {
        a.phase = 'lead';
        a.phaseT = 0;
        a.hp = a.stats.hp;
        a.ref.alive = true;
        a.upT = 0;
      }
      return null;
    }
  }
}
