/**
 * The co-op session simulation on the Asylum (and the power-ups on every map): the time of day and the Matron's
 * hours, the patient files, the buyable doors and the power, the boarded windows and the power-up drops - everything
 * the simulation owns for the squad and reports in its snapshot.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { BARRICADE } from '../src/asylum/barricadeConfig';
import { ASYLUM_DOORS, POWER_LEVER } from '../src/asylum/loopData';
import { NIGHTFALL, PHASE_TUNING, RECORDS } from '../src/asylum/nightConfig';
import { MATRON_DEF } from '../src/enemies/matron';
import { killReward } from '../src/logic/economy';
import { POWERUPS } from '../src/logic/powerupConfig';
import { POWERUP_KINDS, type PowerupKind } from '../src/logic/powerups';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim, type SessionKind } from '../src/sim/serverHost';
import type { MapId } from '../src/world/layout/data';

type Msg = { to: string; d: Record<string, unknown> };
type Snap = { lp?: number[]; rc?: number; bd?: number[]; pu?: number[]; pd?: number[][]; ms?: number[] };

function setup(map: MapId = 'asylum', kind: SessionKind = 'mission') {
  const out: Msg[] = [];
  const sim = new SessionSim({ seed: 5, kind, map, send: (to, d) => out.push({ to, d }) });
  sim.players([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }]);
  sim.begin();
  const st = sim.level.data.playerStart;
  const where: Record<string, { x: number; z: number; st: number }> = {
    p1: { x: st.x, z: st.z, st: LIFE.up },
    p2: { x: st.x + 1.5, z: st.z, st: LIFE.up },
  };
  const report = (id: string): void => {
    const w = where[id]!;
    sim.message(id, { k: 'p', x: w.x, y: 0, z: w.z, yaw: 0, up: w.st === LIFE.up, st: w.st, hp: 100 }, false);
  };
  const run = (seconds: number): void => {
    for (let i = 0; i < Math.max(1, Math.round(seconds * 30)); i++) {
      if (i % 3 === 0) for (const id of Object.keys(where)) report(id);
      sim.tick(1 / 30);
    }
  };
  /** Put a player somewhere and let the simulation hear it. */
  const at = (id: string, x: number, z: number): void => {
    where[id] = { x, z, st: LIFE.up };
    report(id);
  };
  /** The next snapshot (a few short ticks until one goes out). */
  const snap = (): Snap => {
    const from = out.length;
    for (let i = 0; i < 10 && !out.slice(from).some((m) => m.d.k === 's'); i++) sim.tick(1 / 30);
    return [...out].reverse().find((m) => m.d.k === 's')!.d as Snap;
  };
  const sent = (k: string): Msg[] => out.filter((m) => m.d.k === k);
  return { sim, out, where, run, at, snap, sent };
}

describe('co-op simulation on the Asylum: day and night', () => {
  it('by day the Matron is not on the hill and the infected are sleepy; at nightfall she wakes', () => {
    const { sim, run, snap } = setup();
    run(2);
    expect(sim.zombies.boss).toBeNull();
    expect(sim.debug.hunt.status).toBe('available');
    expect(sim.zombies.phaseTuning.speed).toBeCloseTo(PHASE_TUNING.day.speed);
    expect(snap().ms![1]).toBe(0); // the hunt is reported closed
    sim.debug.setElapsed(NIGHTFALL + 1);
    run(0.5);
    const boss = sim.zombies.boss!;
    expect(boss?.alive).toBe(true);
    expect(boss.def).toBe(MATRON_DEF);
    expect(sim.debug.hunt.status).toBe('active');
    expect(sim.zombies.phaseTuning.speed).toBeCloseTo(PHASE_TUNING.night.speed);
    expect(snap().ms![1]).toBe(1);
  });

  it('runs on the Asylum clock: the District would have been sealed by now, the hill is not', () => {
    const { sim, run } = setup();
    run(0.5);
    sim.debug.setElapsed(13 * 60); // past the District's 12 minutes, before the Asylum's gates close
    run(0.5);
    expect(sim.finished).toBe(false);
    sim.debug.setElapsed(15 * 60 + 1);
    run(0.2);
    expect(sim.stats().outcome).toMatch(/^lost/);
  });
});

describe('co-op simulation on the Asylum: the patient files', () => {
  it('a file is taken once, by someone standing at it, and every client is told', () => {
    const { sim, run, at, snap } = setup();
    run(0.5);
    const f = RECORDS.spots[1]!;
    // from across the map: refused
    sim.message('p1', { k: 'rec', i: 1 }, false);
    expect(sim.debug.records.found[1]).toBe(false);
    at('p1', f.x, f.z);
    sim.message('p1', { k: 'rec', i: 1 }, false);
    expect(sim.debug.records.found).toEqual([false, true, false]);
    expect(snap().rc).toBe(0b010);
    // asking again (or for a file that does not exist) changes nothing
    at('p2', f.x, f.z);
    sim.message('p2', { k: 'rec', i: 1 }, false);
    sim.message('p2', { k: 'rec', i: 7 }, false);
    expect(snap().rc).toBe(0b010);
    for (const i of [0, 2]) {
      at('p2', RECORDS.spots[i]!.x, RECORDS.spots[i]!.z);
      sim.message('p2', { k: 'rec', i }, false);
    }
    expect(snap().rc).toBe(0b111);
    expect(sim.debug.records.bonusClaimed).toBe(true);
  });
});

describe('co-op simulation on the Asylum: doors and the power', () => {
  it('shuts every door at the start; a bought door opens for everyone and lets the infected spawn behind it', () => {
    const { sim, run, at, snap, sent } = setup();
    run(0.5);
    expect(sim.loop.doors.every((d) => d === 0)).toBe(true);
    expect(snap().lp).toEqual([0, 0]);
    const i = ASYLUM_DOORS.findIndex((d) => d.id === 'westWardFront');
    const d = ASYLUM_DOORS[i]!;
    expect(sim.level.doors!.isOpen(i)).toBe(false);
    expect(sim.zombies.spawnAllowed!(-22, 0)).toBe(false); // the west ward
    // from the start: too far
    sim.message('p1', { k: 'door', i }, false);
    expect(sim.loop.doors[i]).toBe(0);
    at('p1', d.x, d.z + 1.2);
    sim.message('p1', { k: 'door', i }, false);
    expect(sim.loop.doors[i]).toBe(1);
    expect(sim.level.doors!.isOpen(i)).toBe(true);
    expect(sim.zombies.spawnAllowed!(-22, 0)).toBe(true);
    expect(snap().lp).toEqual([1 << i, 0]);
    // the buyer (only) is asked to pay, once
    expect(sent('bought')).toEqual([{ to: 'p1', d: { k: 'bought', i, c: d.cost } }]);
    at('p2', d.x, d.z + 1.2);
    sim.message('p2', { k: 'door', i }, false);
    expect(sent('bought').length).toBe(1);
  });

  it('will not open a door between two closed zones, or one that does not exist', () => {
    const { sim, run, at } = setup();
    run(0.5);
    const i = ASYLUM_DOORS.findIndex((d) => d.id === 'yardBack');
    const d = ASYLUM_DOORS[i]!;
    at('p1', d.x, d.z + 1);
    sim.message('p1', { k: 'door', i }, false);
    sim.message('p1', { k: 'door', i: 99 }, false);
    expect(sim.loop.doors.every((q) => q === 0)).toBe(true);
  });

  it('the power comes on with the lever (from the boiler house only)', () => {
    const { sim, run, at, snap } = setup();
    run(0.5);
    sim.message('p1', { k: 'lever' }, false);
    expect(sim.loop.power).toBe(0);
    at('p1', POWER_LEVER.x, POWER_LEVER.z + 1);
    sim.message('p1', { k: 'lever' }, false);
    expect(sim.loop.power).toBe(1);
    expect(snap().lp![1]).toBe(1);
  });

  it('the power comes on when the generators are running (RESTORE THE POWER)', () => {
    const { sim, run, snap } = setup();
    run(0.5);
    expect(sim.loop.power).toBe(0);
    sim.debug.defense.status = 'complete';
    run(0.2);
    expect(sim.loop.power).toBe(1);
    expect(snap().lp![1]).toBe(1);
  });

  it('free roam tours the hill with every door open and the lights on', () => {
    const { sim, run, snap } = setup('asylum', 'roam');
    run(0.5);
    expect(sim.loop.doors.every((d) => d === 1)).toBe(true);
    expect(snap().lp).toEqual([(1 << ASYLUM_DOORS.length) - 1, 1]);
  });
});

describe('co-op simulation on the Asylum: the boarded windows', () => {
  it('the infected tear the boards off; a repair from inside nails one back and pays, up to the cap', () => {
    const { sim, run, at, snap, sent } = setup();
    run(0.5);
    const b = sim.debug.barricades!;
    expect(b.defs.length).toBeGreaterThan(5);
    // the window furthest from the squad (they would shoot the one sent to it)
    const st = sim.level.data.playerStart;
    const w = b.defs.reduce((a, q) => (Math.hypot(q.x - st.x, q.z - st.z) > Math.hypot(a.x - st.x, a.z - st.z) ? q : a));
    expect(snap().bd).toEqual(b.defs.map(() => BARRICADE.boards));
    // one of the infected is sent to the window and goes to work on it
    const z = sim.zombies.spawn('shambler', w.spawnX, w.spawnZ, new Rng(2));
    expect(b.attach(z, w.id)).toBe(true);
    for (let i = 0; i < 30 && b.state.boards[w.id]! === BARRICADE.boards; i++) run(0.5);
    expect(b.state.boards[w.id]).toBeLessThan(BARRICADE.boards);
    const torn = b.state.boards[w.id]!;
    expect(snap().bd![w.id]).toBe(torn);
    // a repair from outside, or from across the map, is refused
    sim.message('p1', { k: 'fix', i: w.id }, false);
    at('p1', w.outX + w.nx * 1.5, w.outZ + w.nz * 1.5);
    sim.message('p1', { k: 'fix', i: w.id }, false);
    expect(sent('fixed').length).toBe(0);
    // from inside the window: one board back, paid
    sim.zombies.remove(z); // (out of the way)
    at('p1', w.inX, w.inZ);
    sim.message('p1', { k: 'fix', i: w.id }, false);
    expect(b.state.boards[w.id]).toBe(torn + 1);
    expect(sent('fixed')[0]).toEqual({ to: 'p1', d: { k: 'fixed', i: w.id, c: BARRICADE.repairPay } });
    // the pay is capped: a window opened again and again pays out the purse and then nothing for a while
    for (let round = 0; round < 3; round++) {
      b.state.boards[w.id] = 0;
      for (let k = 0; k < BARRICADE.boards; k++) sim.message('p1', { k: 'fix', i: w.id }, false);
    }
    const paid = sent('fixed').reduce((s, m) => s + Number(m.d.c), 0);
    expect(paid).toBe(BARRICADE.payCap);
    expect(b.state.boards[w.id]).toBe(BARRICADE.boards);
  });
});

describe('co-op simulation: power-ups', () => {
  /** Line the next drop up: the bag gives `kind`, and the pity timer makes the next eligible kill drop. */
  const prime = (sim: SessionSim, kind: PowerupKind): void => {
    const s = sim.debug.powerups;
    s.bag = [kind];
    s.dry = POWERUPS.pityMax;
  };
  const nearest = (sim: SessionSim, x: number, z: number) =>
    sim.zombies.zombies.filter((q) => q.alive && !q.isBoss && !q.dormant).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]!;

  it('a kill drops one; the nearest player walking into it takes it and everyone hears; insta-kill runs 30 s', () => {
    const { sim, run, at, snap, sent, where } = setup('district');
    run(1);
    prime(sim, 'instaKill');
    const z = nearest(sim, where.p1!.x, where.p1!.z);
    sim.message('p2', { k: 'hit', z: z.id, a: 590, h: true, y: 0 }, false);
    const drops = sim.debug.powerups.drops;
    expect(drops.length).toBe(1);
    const d = drops[0]!;
    expect(snap().pd).toEqual([[d.id, POWERUP_KINDS.indexOf('instaKill'), Math.round(d.x * 10) / 10, Math.round(d.z * 10) / 10, expect.any(Number)]]);
    // both close; p1 is nearer
    at('p1', d.x + 0.3, d.z);
    at('p2', d.x + 0.9, d.z);
    run(0.1);
    expect(sim.debug.powerups.drops.length).toBe(0);
    const pw = sent('pw');
    expect(pw.length).toBe(1);
    expect(pw[0]!.to).toBe('all');
    expect(pw[0]!.d).toMatchObject({ id: d.id, w: POWERUP_KINDS.indexOf('instaKill'), n: 'One', c: 0 });
    expect(snap().pu![0]).toBeGreaterThan(POWERUPS.timed - 2);
    // any hit kills now (not the boss)
    const q = nearest(sim, where.p1!.x, where.p1!.z);
    sim.message('p1', { k: 'hit', z: q.id, a: 1, h: false, y: 0 }, false);
    expect(q.alive).toBe(false);
    const boss = sim.zombies.boss!;
    sim.message('p1', { k: 'hit', z: boss.id, a: 1, h: false, y: 0 }, false);
    expect(boss.alive).toBe(true);
    run(POWERUPS.timed + 1);
    expect(sim.debug.powerups.timers.instaKill).toBe(0);
  });

  it('double points doubles the kill cash for 30 s', () => {
    const { sim, run, at, sent, where } = setup('district');
    run(1);
    sim.debug.powerups.drops.push({ id: 50, kind: 'doublePoints', x: where.p1!.x, z: where.p1!.z, age: 0 });
    run(0.1);
    expect(sim.debug.powerups.timers.doublePoints).toBeGreaterThan(POWERUPS.timed - 1);
    at('p2', where.p2!.x + 20, where.p2!.z);
    const z = nearest(sim, where.p1!.x, where.p1!.z);
    const base = killReward(z.def, true, sim.level.regionAt(z.x, z.z));
    sim.message('p1', { k: 'hit', z: z.id, a: 590, h: true, y: 0 }, false);
    expect(sent('kill').at(-1)!.d.c).toBe(base * 2);
  });

  it('the nuke kills every infected but the boss on the simulation, pays everyone and drops nothing', () => {
    const { sim, run, sent, where } = setup('district');
    run(1);
    const alive = sim.zombies.zombies.filter((q) => q.alive && !q.isBoss).length;
    expect(alive).toBeGreaterThan(5);
    sim.debug.powerups.dry = POWERUPS.pityMax; // a drop would be certain
    sim.debug.powerups.drops.push({ id: 51, kind: 'nuke', x: where.p1!.x, z: where.p1!.z, age: 0 });
    run(0.1);
    expect(sim.zombies.zombies.filter((q) => q.alive && !q.isBoss).length).toBe(0);
    expect(sim.zombies.boss?.alive).toBe(true);
    expect(sent('pw')[0]!.d).toMatchObject({ w: POWERUP_KINDS.indexOf('nuke'), c: POWERUPS.nukeCash });
    expect(sent('kill').length).toBe(0); // its kills pay nothing...
    expect(sim.debug.powerups.drops.length).toBe(0); // ...and drop nothing
  });

  it('the carpenter boards every window up again on the Asylum', () => {
    const { sim, run, sent, where } = setup();
    run(0.5);
    const b = sim.debug.barricades!;
    b.state.boards[0] = 0;
    b.state.boards[3] = 2;
    sim.debug.powerups.drops.push({ id: 52, kind: 'carpenter', x: where.p1!.x, z: where.p1!.z, age: 0 });
    run(0.1);
    expect(b.state.boards.every((n) => n === BARRICADE.boards)).toBe(true);
    expect(sent('pw')[0]!.d).toMatchObject({ w: POWERUP_KINDS.indexOf('carpenter'), c: POWERUPS.carpenterCash });
  });

  it('a drop nobody takes floats away; free roam has none', () => {
    const { sim, run, snap } = setup('district');
    run(0.5);
    sim.debug.powerups.drops.push({ id: 53, kind: 'maxAmmo', x: 400, z: 400, age: 0 });
    run(POWERUPS.lifetime + 1);
    expect(snap().pd).toEqual([]);
    const roam = setup('district', 'roam');
    roam.run(0.5);
    expect(roam.snap().pu).toBeUndefined();
  });
});

describe('co-op simulation: the QA set-ups', () => {
  it('are refused unless the session runs in development, and then only from the owner', () => {
    const { sim, run } = setup();
    run(0.5);
    sim.message('p1', { k: 'dev', drop: 2, tear: 0 }, true);
    expect(sim.debug.powerups.drops.length).toBe(0);
    expect(sim.debug.barricades!.state.boards[0]).toBe(BARRICADE.boards);
    const dev = new SessionSim({ seed: 5, map: 'asylum', dev: true, send: () => {} });
    dev.players([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }]);
    dev.begin();
    dev.message('p2', { k: 'dev', drop: 2, tear: 0 }, false);
    expect(dev.debug.powerups.drops.length).toBe(0);
    dev.message('p1', { k: 'dev', drop: 2, tear: 0 }, true);
    expect(dev.debug.powerups.drops.map((d) => d.kind)).toEqual(['doublePoints']);
    expect(dev.debug.barricades!.state.boards[0]).toBe(BARRICADE.boards - 3);
  });
});
