/**
 * Squadmates (`SquadDef.equals`, ZARYA's search squad): the player's equals - a player's health and rifle
 * (`SQUADMATE`) - who never die. At no health they go down, the infected leave them, and they get up after
 * `SQUADMATE.downFor` seconds or at once when a player helps them up. Every other map's squad is as it was.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { FORGE_SQUAD, SQUADMATE, SQUADS } from '../src/config';
import type { ZombieEnv } from '../src/enemies/zombie';
import { type AllyBody, type AllyWorld, allyDown, allyDownStep, allyFight, allyFighting, allyHelpUp, allyHurt, allyRecover, makeAllyBody, SOLDIER_STATS, SQUADMATE_STATS, squadEquals, teamStats } from '../src/game/allyBrain';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';

const zarya = new SessionSim({ seed: 5, kind: 'mission', map: 'zarya', send: () => {} });
const forge = new SessionSim({ seed: 5, kind: 'mission', map: 'forge', send: () => {} });
const mate = (skill: Parameters<typeof makeAllyBody>[9] = 'regular'): AllyBody => makeAllyBody(zarya.level, 'Timur', 'soldier', 0, 0, 0, { x: -2.2, z: 2.6 }, false, 0, skill);
const soldier = (): AllyBody => makeAllyBody(forge.level, 'Athy', 'soldier', 0, 0, 0, { x: -2.2, z: 2.6 }, false, 0);

describe('squadmates: who they are', () => {
  it('only ZARYA has them', () => {
    expect(squadEquals('zarya')).toBe(true);
    expect(Object.entries(SQUADS).filter(([, d]) => d.equals).map(([m]) => m)).toEqual(['zarya']);
    expect(mate().equal).toBe(true);
    expect(soldier().equal).toBe(false);
    // someone freed from a cage is never one, whatever the map
    expect(makeAllyBody(zarya.level, 'Anyone', 'survivor', 0, 0, 0, { x: 0, z: 3 }, true, 0).equal).toBe(false);
  });

  it("their numbers are a player's (`SQUADMATE`), with the hit chances every ally has", () => {
    const s = mate().stats;
    expect(s.hp).toBe(SQUADMATE.hp);
    expect(s.damageTaken).toBe(SQUADMATE.damageTaken);
    expect(s.range).toBe(SQUADMATE.range);
    expect(s.fireInterval).toBe(SQUADMATE.fireInterval);
    expect(s.bodyDamage).toBe(SQUADMATE.bodyDamage);
    expect(s.headDamage).toBe(SQUADMATE.headDamage);
    expect([s.hitNear, s.hitFar, s.headChance]).toEqual([SOLDIER_STATS.hitNear, SOLDIER_STATS.hitFar, SOLDIER_STATS.headChance]);
    expect(mate().hp).toBe(SQUADMATE.hp);
    // the Forge's co-leaders keep theirs
    expect(soldier().stats.hp).toBe(FORGE_SQUAD.allyHp);
    expect(soldier().stats.bodyDamage).toBe(FORGE_SQUAD.bodyDamage);
  });

  it('a rookie squad setting never makes them less than the player; a setting above regular makes them more', () => {
    expect(mate('rookie').stats).toEqual(mate('regular').stats);
    expect(mate('regular').stats).toEqual(SQUADMATE_STATS);
    expect(mate('elite').stats).toEqual(teamStats(SQUADMATE_STATS, 'elite'));
    expect(mate('elite').stats.hp).toBeGreaterThan(SQUADMATE.hp);
  });
});

describe('squadmates: down, not dead', () => {
  it('at no health they go down: still alive, out of the fight, and not hurt any further', () => {
    const a = mate();
    expect(allyHurt(a, 30)).toBeNull();
    expect(a.hp).toBe(SQUADMATE.hp - 30 * SQUADMATE.damageTaken);
    expect(allyFighting(a)).toBe(true);
    expect(allyHurt(a, 500)).toBe('down');
    expect(a.hp).toBe(0);
    expect(a.ref.alive).toBe(true);
    expect(a.down).toBe(SQUADMATE.downFor);
    expect(allyFighting(a)).toBe(false);
    // a blow on someone already down does nothing (and does not start the clock again)
    a.down = 3;
    expect(allyHurt(a, 500)).toBeNull();
    expect(a.down).toBe(3);
    // and nothing heals them on the ground
    a.sinceHurt = 99;
    allyRecover(a, 5);
    expect(a.hp).toBe(0);
  });

  it('they get up by themselves after `downFor` seconds, with `upWith` of their health', () => {
    const a = mate();
    allyHurt(a, 500);
    let t = 0;
    let got: 'up' | null = null;
    while (!got && t < SQUADMATE.downFor + 5) {
      got = allyDownStep(a, 0.1);
      t += 0.1;
    }
    expect(got).toBe('up');
    expect(t).toBeGreaterThan(SQUADMATE.downFor - 0.2);
    expect(t).toBeLessThan(SQUADMATE.downFor + 0.2);
    expect(a.down).toBe(0);
    expect(a.hp).toBe(Math.round(SQUADMATE.hp * SQUADMATE.upWith));
    expect(a.ref.alive).toBe(true);
    expect(allyFighting(a)).toBe(true);
    // on their feet the clock is nothing
    expect(allyDownStep(a, 1)).toBeNull();
    // and they can go down again
    expect(allyHurt(a, 500)).toBe('down');
  });

  it('a player helps them up at once', () => {
    const a = mate();
    expect(allyHelpUp(a)).toBe(false); // not down: nothing to do
    expect(a.hp).toBe(SQUADMATE.hp);
    allyHurt(a, 500);
    allyDownStep(a, 1);
    expect(allyHelpUp(a)).toBe(true);
    expect(a.down).toBe(0);
    expect(a.hp).toBe(Math.round(SQUADMATE.hp * SQUADMATE.upWith));
    expect(allyFighting(a)).toBe(true);
  });

  it("any other map's soldier still dies, and stays dead", () => {
    const a = soldier();
    expect(allyHurt(a, 30)).toBeNull();
    expect(a.hp).toBeCloseTo(FORGE_SQUAD.allyHp - 30 * FORGE_SQUAD.allyDamageTaken, 9);
    expect(allyHurt(a, 5000)).toBe('dead');
    expect(a.ref.alive).toBe(false);
    expect(a.hp).toBe(0);
    expect(a.down).toBe(0);
    expect(allyDownStep(a, SQUADMATE.downFor + 1)).toBeNull();
    expect(allyHelpUp(a)).toBe(false);
    expect(a.ref.alive).toBe(false);
    expect(allyHurt(a, 10)).toBeNull();
  });

  it('while down they do not shoot; back up, they do', () => {
    const sim = new SessionSim({ seed: 8, kind: 'mission', map: 'zarya', send: () => {} });
    const st = sim.level.data.playerStart;
    const a = makeAllyBody(sim.level, 'Vera', 'soldier', st.x, st.z, 0, { x: 2.2, z: 2.6 }, false, 0);
    const rng = new Rng(3);
    const w: AllyWorld = { level: sim.level, zombies: sim.zombies, rng, followLeader: () => false };
    for (const z of [...sim.zombies.zombies]) sim.zombies.remove(z);
    // one infected in the open a few metres off (the nearest free spot the squad's own regrouping would use)
    const at = sim.level.nav.randomFreeNear(st.x, st.z - 5, 2, () => rng.f()) ?? { x: st.x, z: st.z - 5 };
    sim.zombies.spawn('armored', at.x, at.z, rng, { state: 'idle' });
    const shots = (seconds: number): number => {
      let n = 0;
      for (let i = 0; i < seconds * 30; i++) if (allyFight(a, w, 1 / 30)) n++;
      return n;
    };
    expect(shots(2)).toBeGreaterThan(0);
    allyDown(a);
    expect(a.target).toBeNull();
    expect(shots(3)).toBe(0);
    expect(allyHelpUp(a)).toBe(true);
    expect(shots(2)).toBeGreaterThan(0);
  }, 120_000); // builds the whole town (several seconds; longer on a busy machine)
});

describe('squadmates: the co-op simulation', () => {
  it('one brought to no health is reported down, left alone by the infected, and later reported up', () => {
    const out: Record<string, unknown>[] = [];
    const sim = new SessionSim({ seed: 11, kind: 'mission', map: 'zarya', send: (_to, d) => out.push(d) });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const st = sim.level.data.playerStart;
    const run = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds * 30); i++) {
        if (i % 3 === 0) sim.message('p1', { k: 'p', x: st.x, y: 0, z: st.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
        sim.tick(1 / 30);
      }
    };
    const row = (i: number): number[] => ([...out].reverse().find((m) => m.k === 's' && Array.isArray(m.sq))!.sq as number[][]).find((r) => r[0] === i)!;
    // who the infected may go for, as the simulation hands them over each step
    let hunted: unknown[] = [];
    const update = sim.zombies.update.bind(sim.zombies);
    sim.zombies.update = (dt, env, any, envs) => {
      hunted = (envs ?? []).map((e: ZombieEnv) => e.player);
      update(dt, env, any, envs);
    };
    run(1);
    // one player: both of the squad deploy, as squadmates
    const squad = sim.debug.allies.filter((q) => q.kind === 'soldier');
    expect(squad.map((q) => q.name)).toEqual([...SQUADS.zarya!.names]);
    expect(squad.every((q) => q.equal && q.stats.hp === SQUADMATE.hp)).toBe(true);
    const a = squad[0]!;
    const i = sim.debug.allies.indexOf(a);
    expect(row(i)[4]).toBe(1);
    expect(hunted).toContain(a.ref);

    const host = sim as unknown as { hurtAlly(a: AllyBody, amount: number, sx: number, sz: number): void };
    host.hurtAlly(a, 1000, a.ref.x, a.ref.z + 1);
    expect(a.ref.alive).toBe(true);
    expect(a.down).toBeGreaterThan(0);
    const fell = { x: a.ref.x, z: a.ref.z };
    run(1);
    expect(row(i)[4]).toBe(3);
    expect(row(i)[5]).toBe(0);
    expect(hunted).not.toContain(a.ref);
    // they lie where they fell
    expect(Math.hypot(a.ref.x - fell.x, a.ref.z - fell.z)).toBeLessThan(0.01);

    // a player too far away cannot help; one at their side can
    sim.message('p1', { k: 'p', x: a.ref.x + 30, y: 0, z: a.ref.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    sim.message('p1', { k: 'help', i }, false);
    expect(a.down).toBeGreaterThan(0);
    sim.message('p1', { k: 'p', x: a.ref.x + 1, y: 0, z: a.ref.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    sim.message('p1', { k: 'help', i }, false);
    expect(a.down).toBe(0);
    expect(a.hp).toBe(Math.round(SQUADMATE.hp * SQUADMATE.upWith));
    run(0.5);
    expect(row(i)[4]).toBe(1);
    expect(hunted).toContain(a.ref);

    // down again, and nobody helps: their own time gets them up
    host.hurtAlly(a, 1000, a.ref.x, a.ref.z + 1);
    run(SQUADMATE.downFor - 2);
    expect(row(i)[4]).toBe(3);
    run(3);
    expect(row(i)[4]).toBe(1);
    expect(a.down).toBe(0);
    expect(a.hp).toBeGreaterThan(0);
    // nobody was lost on the way
    expect(sim.debug.allies.every((q) => q.ref.alive)).toBe(true);
  }, 120_000); // builds the whole town (several seconds; longer on a busy machine)
});
