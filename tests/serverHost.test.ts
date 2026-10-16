import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { FORGE_SQUAD, MISSION, SURVIVORS, TEAM_SKILL, VULCAN_LEADERSHIP, ZOMBIE_DIFFICULTY, ZOMBIES } from '../src/config';
import { LIFE, SessionSim, type SessionKind, sessionDifficulty } from '../src/sim/serverHost';
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

  it('on the Forge: two co-leaders deploy, the people are holed up in rooms (no cages), and the flames pay everyone', () => {
    const { sim, out, run, where } = setup('mission', 'forge');
    run(1);
    const allies = sim.debug.allies;
    const squad = allies.filter((a) => a.kind === 'soldier').map((a) => a.name);
    expect(squad.length).toBe(2);
    expect(new Set(squad).size).toBe(2);
    for (const n of squad) expect(VULCAN_LEADERSHIP.coLeads as readonly string[]).toContain(n);
    expect(allies.some((a) => a.kind === 'survivor')).toBe(false);
    expect(sim.forge!.view.squad).toEqual(squad);
    // the roster and the story's state go out in the snapshots
    const snap = [...out].reverse().find((m) => m.d.k === 's' && m.d.fg)!.d as { fg: unknown; fr?: unknown };
    expect(snap.fg).toBeDefined();
    expect(out.some((m) => m.d.k === 's' && m.d.fr)).toBe(true);
    void SURVIVORS;
    // a furnace is stoked on request, from in front of it
    const front = sim.forge!.furnaceFront(0)!;
    where.p2 = { x: front.x, z: front.z, st: LIFE.up };
    run(0.5);
    sim.message('p2', { k: 'stoke', i: 0 }, false);
    expect(sim.forge!.view.furnaces[0]!.phase).toBe('burning');
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

  it('Standard Mazoku is the map\'s own operation plus the five carriers, nothing else, on every map', () => {
    for (const map of ['district', 'forge', 'asylum'] as MapId[]) {
      const make = (kind: SessionKind): SessionSim => {
        const s = new SessionSim({ seed: 9, kind, map, send: () => {} });
        s.players([{ id: 'p1', name: 'One' }]);
        s.begin();
        return s;
      };
      const a = make('mission');
      const b = make('mazoku');
      const others = (s: SessionSim) => s.zombies.zombies.filter((z) => !z.curable).map((z) => `${z.type}@${z.x.toFixed(1)},${z.z.toFixed(1)}`);
      expect(b.zombies.zombies.filter((z) => z.curable).length).toBe(5);
      expect(a.zombies.zombies.filter((z) => z.curable).length).toBe(0);
      expect(others(b)).toEqual(others(a));
      expect(b.debug.allies.map((x) => x.name)).toEqual(a.debug.allies.map((x) => x.name));
      expect(JSON.stringify(b.forge?.view ?? null)).toBe(JSON.stringify(a.forge?.view ?? null));
      expect([b.debug.defense.status, b.debug.hunt.status, b.debug.extraction.phase, !!b.debug.barricades]).toEqual([a.debug.defense.status, a.debug.hunt.status, a.debug.extraction.phase, !!a.debug.barricades]);
    }
  }, 30000);

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

describe('co-op session simulation: difficulty', () => {
  it('makes the infected and the squad from the picks of the session', () => {
    const sim = new SessionSim({ seed: 7, kind: 'mission', map: 'forge', difficulty: { zombies: 'nightmare', team: 'elite' }, send: () => {} });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const shambler = sim.zombies.zombies.find((z) => z.type === 'shambler')!;
    expect(shambler.maxHp).toBeCloseTo(ZOMBIES.shambler.hp * ZOMBIE_DIFFICULTY.nightmare.hp, 5);
    expect(shambler.dmgScale).toBe(ZOMBIE_DIFFICULTY.nightmare.damage);
    const lead = sim.debug.allies.find((a) => a.kind === 'soldier')!;
    expect(lead.hp).toBe(Math.round(FORGE_SQUAD.allyHp * TEAM_SKILL.elite.hp));
    expect(lead.stats.fireInterval).toBeCloseTo(FORGE_SQUAD.fireInterval / TEAM_SKILL.elite.fireRate, 5);
  });

  it('applies a change from the lobby on the next run, and ignores nonsense', () => {
    const sim = new SessionSim({ seed: 7, kind: 'mission', map: 'district', send: () => {} });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const before = sim.zombies.zombies.filter((z) => z.alive && !z.isBoss).length;
    sim.difficulty = sessionDifficulty({ zombies: 'easy', team: 'rookie' });
    sim.begin();
    expect(sim.zombies.zombies.find((z) => z.type === 'shambler')!.maxHp).toBeCloseTo(ZOMBIES.shambler.hp * ZOMBIE_DIFFICULTY.easy.hp, 5);
    expect(sim.zombies.zombies.filter((z) => z.alive && !z.isBoss).length).toBeLessThan(before); // a quieter zone
    expect(sessionDifficulty({ zombies: 'impossible', team: 42 })).toEqual({ zombies: 'normal', team: 'regular' });
  });
});

describe('co-op session simulation: the Warden stays findable', () => {
  it('is revealed when drawn out of the compound, and walks back to his lair once the squad is gone', () => {
    const { sim, where, run } = setup();
    run(1);
    const h = sim.level.data.hunt;
    const boss = sim.zombies.boss!;
    const st = sim.level.data.playerStart;
    // he chased the squad most of the way to the insertion point and gave up there
    const out = sim.level.nav.randomFreeNear(st.x + (h.wardenX - st.x) * 0.25, st.z + (h.wardenZ - st.z) * 0.25, 6, () => 0.5)!;
    boss.returnHome(out.x, out.z, 0);
    run(1);
    expect(boss.state).toBe('idle');
    // drawn out of the search area: the hunt reveals him, so the marker leads to him, not to an empty compound
    expect(sim.debug.hunt.identified).toBe(true);
    // the squad is elsewhere: he walks back to his lair (nobody sees the move)
    const far = sim.level.nav.randomFreeNear(st.x - 60, st.z, 20, () => 0.5) ?? { x: st.x - 60, z: st.z };
    where.p1 = { x: far.x, z: far.z, st: LIFE.up };
    where.p2 = { x: far.x + 1, z: far.z, st: LIFE.up };
    run(10);
    expect(sim.zombies.boss).toBe(boss);
    expect(Math.hypot(boss.x - h.wardenX, boss.z - h.wardenZ)).toBeLessThan(15);
  });

  it('puts a missing Warden back while the hunt is open', () => {
    const { sim, run } = setup();
    run(1);
    sim.zombies.remove(sim.zombies.boss!);
    expect(sim.zombies.boss).toBeNull();
    run(1);
    expect(sim.zombies.boss?.alive).toBe(true);
    expect(sim.debug.hunt.status).toBe('active');
  });
});
