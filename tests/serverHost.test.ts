import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { FORGE_SQUAD, MISSION, SURVIVORS } from '../src/config';
import { LIFE, SessionSim, type SessionKind } from '../src/sim/serverHost';
import type { MapId } from '../src/world/layout/data';

type Msg = { to: string; d: Record<string, unknown> };

function setup(kind: SessionKind = 'mission', map: MapId = 'district') {
  const out: Msg[] = [];
  const sim = new SessionSim({ seed: 7, kind, map, send: (to, d) => out.push({ to, d }) });
  sim.players([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }]);
  sim.begin();
  const where: Record<string, { x: number; z: number; st: number }> = {};
  const st = sim.level.data.playerStart;
  where.p1 = { x: st.x, z: st.z, st: LIFE.up };
  where.p2 = { x: st.x + 1.5, z: st.z, st: LIFE.up };
  const report = (id: string): void => {
    const w = where[id]!;
    sim.message(id, { k: 'p', x: w.x, y: 0, z: w.z, yaw: 0, up: w.st === LIFE.up, st: w.st, hp: 100 }, false);
  };
  const run = (seconds: number): void => {
    for (let i = 0; i < seconds * 30; i++) {
      if (i % 3 === 0) for (const id of Object.keys(where)) report(id);
      sim.tick(1 / 30);
    }
  };
  const last = (k: string): Msg | undefined => [...out].reverse().find((m) => m.d.k === k);
  return { sim, out, where, report, run, last };
}

describe('co-op session simulation: the story operation', () => {
  it('builds the map without a browser and waits for the first player', () => {
    const { sim, out } = setup();
    for (let i = 0; i < 60; i++) sim.tick(1 / 30);
    expect(sim.level.data.spawnPoints.length).toBeGreaterThan(10);
    expect(sim.stats().elapsed).toBe(0);
    expect(out.some((m) => m.d.k === 's')).toBe(true);
  });

  it('populates the district, starts the clock and reports the operation', () => {
    const { sim, run, last } = setup();
    run(3);
    expect(sim.stats().elapsed).toBeGreaterThan(2);
    expect(sim.zombies.boss?.alive).toBe(true);
    const s = last('s')!.d as { ms: number[]; p: unknown[][]; sq: unknown[][] };
    expect(s.ms[0]).toBeGreaterThan(2);
    expect(s.p.map((r) => r[0]).sort()).toEqual(['p1', 'p2']);
    expect(s.sq.length).toBe(SURVIVORS.district.length); // the cages
  });

  it('attacks the players and credits a kill to whoever made it', () => {
    const { sim, out, run, where } = setup();
    run(1);
    // walk p1 into the nearest resident
    const z = sim.zombies.zombies.filter((q) => q.alive && !q.isBoss).sort((a, b) => Math.hypot(a.x - where.p1!.x, a.z - where.p1!.z) - Math.hypot(b.x - where.p1!.x, b.z - where.p1!.z))[0]!;
    where.p1 = { x: z.x + 1, z: z.z, st: LIFE.up };
    run(8);
    expect(out.some((m) => m.d.k === 'hurt' && m.to === 'p1')).toBe(true);
    const target = sim.zombies.zombies.find((q) => q.alive && !q.isBoss)!;
    sim.message('p2', { k: 'hit', z: target.id, a: 590, h: true, y: 0 }, false);
    expect(target.alive).toBe(false);
    expect(out.find((m) => m.d.k === 'kill')?.to).toBe('p2');
  });

  it('runs the relay for the squad and completes the hunt when the boss dies', () => {
    const { sim, run, where } = setup();
    run(1);
    const c = sim.level.transmitter.console;
    where.p1 = { x: c.x, z: c.z + 1.2, st: LIFE.up };
    run(0.5);
    sim.message('p1', { k: 'relay' }, false);
    expect(sim.debug.defense.status).toBe('active');
    const d = sim.level.data.defense;
    where.p1 = { x: d.x + 1, z: d.z + 1, st: LIFE.up };
    run(MISSION.defense.duration + 3);
    expect(sim.debug.defense.status).toBe('complete');
    const boss = sim.zombies.boss!;
    for (let i = 0; i < 20 && boss.alive; i++) sim.message('p2', { k: 'hit', z: boss.id, a: 600, h: true, y: 0 }, false);
    expect(sim.debug.hunt.status).toBe('complete');
    run(0.2);
    expect(sim.debug.extraction.phase).toBe('available');
  });

  it('calls the extraction from the radio, boards players and wins when everyone standing is aboard', () => {
    const { sim, out, run, where } = setup();
    run(1);
    sim.debug.defense.status = 'complete';
    sim.debug.hunt.status = 'complete';
    run(0.2);
    const e = sim.level.data.extraction;
    where.p1 = { x: e.terminalX - 1, z: e.terminalZ, st: LIFE.up };
    where.p2 = { x: e.terminalX - 2, z: e.terminalZ, st: LIFE.up };
    run(0.5);
    sim.message('p1', { k: 'call' }, false);
    expect(sim.debug.extraction.phase).toBe('called');
    run(MISSION.extraction.countdown + 1);
    expect(sim.debug.extraction.phase).toBe('landed');
    where.p1 = { x: e.heliX + 1, z: e.heliZ, st: LIFE.up };
    where.p2 = { x: e.heliX - 1, z: e.heliZ, st: LIFE.up };
    run(0.5);
    sim.message('p1', { k: 'board' }, false);
    expect(out.some((m) => m.d.k === 'boarded' && m.to === 'p1')).toBe(true);
    expect(sim.finished).toBe(false); // p2 is still on the ground
    sim.message('p2', { k: 'board' }, false);
    run(0.2);
    expect(sim.finished).toBe(true);
    expect(sim.stats().outcome).toMatch(/^won/);
  });

  it('lets a teammate revive a downed player, and loses when nobody is standing', () => {
    const { sim, out, run, where } = setup();
    run(1);
    where.p2 = { ...where.p2!, st: LIFE.down };
    run(0.5);
    sim.message('p1', { k: 'revive', id: 'p2' }, false);
    expect(out.some((m) => m.d.k === 'revived' && m.to === 'p2')).toBe(true);
    where.p2 = { ...where.p2!, st: LIFE.up };
    run(0.5);
    expect(sim.finished).toBe(false);
    where.p1 = { ...where.p1!, st: LIFE.down };
    where.p2 = { ...where.p2!, st: LIFE.out };
    run(0.5);
    expect(sim.finished).toBe(true);
    expect(sim.stats().outcome).toMatch(/^lost/);
  });

  it('a revive needs the reviver up and close', () => {
    const { sim, out, run, where } = setup();
    run(1);
    where.p2 = { x: where.p1!.x + 20, z: where.p1!.z, st: LIFE.down };
    run(0.5);
    sim.message('p1', { k: 'revive', id: 'p2' }, false);
    expect(out.some((m) => m.d.k === 'revived')).toBe(false);
  });

  it('on the Forge: the squad fights, cages open on request and embers pay everyone', () => {
    const { sim, out, run, where } = setup('mission', 'forge');
    run(1);
    const allies = sim.debug.allies;
    expect(allies.filter((a) => a.kind === 'soldier').length).toBe(2);
    expect(allies.filter((a) => a.kind === 'survivor').map((a) => a.name)).toEqual(SURVIVORS.forge.map((s) => s.name));
    const cage = allies.find((a) => a.trapped)!;
    where.p1 = { x: cage.ref.x, z: cage.ref.z - 2.2, st: LIFE.up };
    run(0.5);
    sim.message('p1', { k: 'rescue', id: cage.name }, false);
    expect(cage.trapped).toBe(false);
    expect(out.some((m) => m.d.k === 'cash' && m.to === 'all' && m.d.c === SURVIVORS.rescueCash)).toBe(true);
    const ember = sim.debug.embers[0]!;
    where.p2 = { x: ember.x, z: ember.z, st: LIFE.up };
    run(0.5);
    sim.message('p2', { k: 'ember', i: 0 }, false);
    expect(ember.taken).toBe(true);
    expect(out.some((m) => m.d.k === 'cash' && m.d.c === FORGE_SQUAD.emberCash)).toBe(true);
    // named infected travel in the snapshot with their tag
    const s = [...out].reverse().find((m) => m.d.k === 's')!.d as { z: number[][] };
    expect(sim.zombies.zombies.some((z) => z.tag)).toBe(true);
    expect(s.z.some((r) => r.length === 16)).toBe(true);
  });

  it('Standard Mazoku places the five carriers', () => {
    const { sim, run, last } = setup('mazoku');
    run(1);
    expect(sim.zombies.zombies.filter((z) => z.carrierIdx > 0).length).toBe(5);
    expect((last('s')!.d.c as unknown[]).length).toBe(5);
  });

  it('free roam has no infected, only the players', () => {
    const { sim, run, last } = setup('roam');
    run(2);
    expect(sim.zombies.zombies.length).toBe(0);
    expect((last('s')!.d.p as unknown[]).length).toBe(2);
  });

  it('ignores players it does not seat, and only the owner restarts a finished run', () => {
    const { sim, run, where } = setup();
    sim.message('stranger', { k: 'p', x: 0, y: 0, z: 0, yaw: 0, up: true, st: 1, hp: 100 }, false);
    expect(sim.stats().players).toBe(0);
    run(1);
    where.p1 = { ...where.p1!, st: LIFE.out };
    where.p2 = { ...where.p2!, st: LIFE.out };
    run(0.5);
    expect(sim.finished).toBe(true);
    sim.message('p2', { k: 'restart' }, false);
    expect(sim.finished).toBe(true);
    sim.message('p1', { k: 'restart' }, true);
    expect(sim.finished).toBe(false);
    expect(sim.stats().elapsed).toBe(0);
  });
});
