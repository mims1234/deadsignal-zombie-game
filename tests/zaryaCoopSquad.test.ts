/**
 * ZARYA in co-op: Timur and Vera are part of the story, so the session simulation runs them beside every player count
 * (one, two or three players), with everything they do solo: they keep up, fight, go down and are helped up, hold
 * their fire on the ones the story spares and before Nina's rack, and come through a tram ride or a doorway with the
 * player they were with. Every other map keeps its squad exactly as before.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { SQUADMATE, SQUADS } from '../src/config';
import { type AllyBody, squadRoster } from '../src/game/allyBrain';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { STOPS } from '../src/zarya/places';
import { F as ZF } from '../src/zarya/story';

type Msg = { to: string; d: Record<string, unknown> };
type Spot = { x: number; z: number };

// one town for the whole file (building it takes several seconds); each case seats its players and begins a fresh run
const out: Msg[] = [];
const sim = new SessionSim({ seed: 23, kind: 'mission', map: 'zarya', send: (to, d) => out.push({ to, d }) });
const st = sim.level.data.playerStart;
const rng = new Rng(9);
const free = (x: number, z: number, r = 2): Spot => sim.level.nav.randomFreeNear(x, z, r, () => rng.f()) ?? { x, z };

function room(players: number) {
  const ids = ['p1', 'p2', 'p3'].slice(0, players);
  sim.players(ids.map((id, i) => ({ id, name: `Volunteer ${i + 1}` })));
  sim.begin();
  out.length = 0;
  const where: Record<string, Spot> = {};
  ids.forEach((id, i) => (where[id] = { x: st.x + (i - 1) * 1.6, z: st.z - 1 }));
  const report = (id: string): void => {
    const w = where[id]!;
    sim.message(id, { k: 'p', x: w.x, y: 0, z: w.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
  };
  /** Seconds of play at 30 Hz, every player reporting ten times a second; the shots each ally fired. */
  const run = (seconds: number): number[] => {
    const shots = [0, 0];
    const seen = new Set<object>();
    const from = out.length;
    for (let i = 0; i < Math.round(seconds * 30); i++) {
      if (i % 3 === 0) for (const id of ids) report(id);
      sim.tick(1 / 30);
    }
    for (const m of out.slice(from)) {
      if (m.d.k !== 's' || seen.has(m.d)) continue;
      seen.add(m.d);
      for (const s of (m.d.sh as number[][] | undefined) ?? []) if (s[0]! < 2) shots[s[0]!]!++;
    }
    return shots;
  };
  const squad = () => sim.debug.allies.filter((a) => a.kind === 'soldier');
  const rows = (): number[][] => ([...out].reverse().find((m) => m.d.k === 's' && Array.isArray(m.d.sq))!.d.sq as number[][]);
  const story = sim.zarya as unknown as { f: number };
  const arm = (): void => void (story.f |= ZF.armed);
  /** Nothing else in town; one armored infected standing a few metres off, where both of the squad can see it. */
  const target = () => {
    for (const z of [...sim.zombies.zombies]) sim.zombies.remove(z);
    const [a, b] = squad();
    const cx = (a!.ref.x + b!.ref.x) / 2;
    const cz = (a!.ref.z + b!.ref.z) / 2;
    const seen = (p: Spot): boolean => [a!, b!].every((q) => !sim.level.world.segmentBlocked(q.ref.x, 1.45, q.ref.z, p.x, 1.2, p.z, 'shots'));
    let at = free(cx, cz - 6);
    for (let k = 0; k < 16 && !seen(at); k++) at = free(cx + Math.sin(k * 0.8) * (5 + (k % 3)), cz + Math.cos(k * 0.8) * (5 + (k % 3)));
    expect(seen(at)).toBe(true);
    return sim.zombies.spawn('armored', at.x, at.z, rng, { state: 'idle' });
  };
  return { ids, where, run, squad, rows, arm, target };
}

describe('ZARYA co-op: Timur and Vera play beside every player count', () => {
  it('the roster: ZARYA keeps both at one, two and three players; the maps whose players take seats are unchanged', () => {
    for (const n of [1, 2, 3]) expect(squadRoster('zarya', n)).toEqual(['Timur', 'Vera']);
    expect(SQUADS.zarya!.fillsSeats).toBeFalsy();
    expect([1, 2, 3].map((n) => squadRoster('sakura', n).length)).toEqual([2, 1, 0]);
    expect([1, 2, 3].map((n) => squadRoster('hirasaka', n).length)).toEqual([1, 1, 0]);
    expect(squadRoster('asylum', 3)).toEqual(['Vance', 'Okafor']);
  });

  for (const players of [1, 2, 3]) {
    it(`${players} player${players > 1 ? 's' : ''}: both deploy as squadmates, are sent to every screen, keep up and fight`, () => {
      const r = room(players);
      r.run(1);
      const squad = r.squad();
      expect(squad.map((a) => a.name)).toEqual(['Timur', 'Vera']);
      expect(squad.every((a) => a.equal && a.ref.alive && a.down === 0 && a.stats.hp === SQUADMATE.hp)).toBe(true);
      // the wire: a row for each, standing (state 1), sent to everyone at once
      const s = [...out].reverse().find((m) => m.d.k === 's')!;
      expect(s.to).toBe('all');
      expect(r.rows().filter((q) => q[0]! < 2).map((q) => q[4])).toEqual([1, 1]);
      expect((s.d.p as unknown[][]).length).toBe(players);

      // they keep up: the players walk off across the square, and both are at their heels a few seconds later
      const off = free(st.x + 14, st.z - 10, 3);
      r.ids.forEach((id, i) => (r.where[id] = { x: off.x + i * 1.4, z: off.z }));
      r.run(9);
      for (const a of squad) {
        const near = Math.min(...r.ids.map((id) => Math.hypot(r.where[id]!.x - a.ref.x, r.where[id]!.z - a.ref.z)));
        expect(near, a.name).toBeLessThan(6);
      }

      // empty hands before Nina's rack: an infected right there, and not a shot
      const z0 = r.target();
      expect(r.run(2)).toEqual([0, 0]);
      expect(z0.hp).toBe(z0.maxHp);
      // armed: both shoot it
      r.arm();
      const shots = r.run(3);
      expect(shots[0], 'Timur').toBeGreaterThan(0);
      expect(shots[1], 'Vera').toBeGreaterThan(0);
    }, 180_000);
  }

  it('they hold fire on one the story spares, go down instead of dying, and a player helps them up (three players)', () => {
    const r = room(3);
    r.run(1);
    r.arm();
    const z = r.target();
    z.invulnerable = true; // what `director.spared` reads: nothing hurts it yet (Morozko asking, a sleeper held)
    expect(r.run(2)).toEqual([0, 0]);
    z.invulnerable = false;
    const shots = r.run(2);
    expect(shots[0]! + shots[1]!).toBeGreaterThan(0);
    for (const q of [...sim.zombies.zombies]) sim.zombies.remove(q);

    const [timur] = r.squad();
    const i = sim.debug.allies.indexOf(timur!);
    const host = sim as unknown as { hurtAlly(a: unknown, amount: number, sx: number, sz: number): void };
    host.hurtAlly(timur!, 1000, timur!.ref.x, timur!.ref.z + 1);
    expect(timur!.ref.alive).toBe(true);
    expect(timur!.down).toBeGreaterThan(0);
    r.run(0.5);
    expect(r.rows().find((q) => q[0] === i)![4]).toBe(3);
    // the third player walks over and helps him up
    r.where.p3 = { x: timur!.ref.x + 1, z: timur!.ref.z };
    r.run(0.2);
    sim.message('p3', { k: 'help', i }, false);
    expect(timur!.down).toBe(0);
    r.run(0.5);
    expect(r.rows().find((q) => q[0] === i)![4]).toBe(1);
  }, 180_000);

  it('a tram ride or a doorway brings along the squadmates who were with that player, and nobody else ("rg")', () => {
    const r = room(3);
    // p1 by the squad; p2 and p3 off on the far side of the square
    r.where.p2 = free(st.x - 30, st.z - 20, 3);
    r.where.p3 = { x: r.where.p2.x + 1.4, z: r.where.p2.z };
    r.run(2);
    const squad = r.squad();
    expect(squad.every((a) => (a as AllyBody & { with?: string | null }).with === 'p1')).toBe(true);
    const before = squad.map((a) => ({ x: a.ref.x, z: a.ref.z }));
    // p2 rides to the Rynok: nobody was with them, nobody follows
    const rynok = STOPS.find((s) => s.id === 'rynok')!.door;
    sim.message('p2', { k: 'rg', x: rynok.x, z: rynok.z, yaw: Math.PI, ar: 0 }, false);
    squad.forEach((a, k) => expect(Math.hypot(a.ref.x - before[k]!.x, a.ref.z - before[k]!.z), a.name).toBeLessThan(0.5));
    r.where.p2 = { x: rynok.x, z: rynok.z };
    // p1 rides to Stroiteley Street: both step down beside them, and stay (no walking back to where p1 was)
    const dvor = STOPS.find((s) => s.id === 'dvor')!.door;
    sim.message('p1', { k: 'rg', x: dvor.x, z: dvor.z, yaw: Math.PI, ar: 0 }, false);
    for (const a of squad) expect(Math.hypot(a.ref.x - dvor.x, a.ref.z - dvor.z), a.name).toBeLessThan(4);
    sim.tick(1 / 30); // a step before p1's next report arrives
    r.where.p1 = { x: dvor.x, z: dvor.z };
    r.run(2);
    for (const a of squad) expect(Math.hypot(a.ref.x - dvor.x, a.ref.z - dvor.z), a.name).toBeLessThan(6);
    // nonsense is ignored
    sim.message('p1', { k: 'rg', x: 'x', z: null }, false);
    for (const a of squad) expect(Number.isFinite(a.ref.x) && Number.isFinite(a.ref.z)).toBe(true);
  }, 180_000);

  it('the cost: two more agents in a three-player room stay cheap on the host', () => {
    const r = room(3);
    r.arm();
    r.run(1);
    const t0 = performance.now();
    r.run(10);
    const perTick = (performance.now() - t0) / 300;
    // the whole simulation step (players' reports, the infected, the story and the squad) - logged for the record
    // the same room again without them, for the difference
    const r2 = room(3);
    r2.arm();
    r2.run(1);
    sim.debug.allies.length = 0;
    const t1 = performance.now();
    r2.run(10);
    const bare = (performance.now() - t1) / 300;
    console.log(`zarya 3 players: ${perTick.toFixed(2)} ms per 1/30 s step with Timur and Vera, ${bare.toFixed(2)} ms without`);
    expect(perTick).toBeLessThan(33);
  }, 180_000);
});
