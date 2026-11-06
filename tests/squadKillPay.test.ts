import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { LIFE, SessionSim } from '../src/sim/serverHost';

type Sent = { to: string; k: string; c?: number; n?: string };

/** A squad kill in co-op: every player gets an even share of the reward, rounded down, and nobody is credited the kill. */
describe('squad kills pay the players', () => {
  it('splits the reward evenly between the players, rounded down', () => {
    const sent: Sent[] = [];
    const sim = new SessionSim({ seed: 3, kind: 'mission', map: 'sakura', send: (to, d) => sent.push({ to, ...(d as { k: string }) }) });
    sim.players([
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
      { id: 'p3', name: 'Three' },
    ]);
    sim.begin();
    for (const id of ['p1', 'p2', 'p3']) sim.message(id, { k: 'p', x: 0, y: 0, z: 0, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    const rng = (sim as unknown as { rng: never }).rng;
    const z = sim.zombies.spawn('shambler', 0, 0, rng, {});
    const host = sim as unknown as { allyKill: boolean; onKill: (z: unknown, head: boolean) => void };
    sent.length = 0;
    host.allyKill = true;
    host.onKill(z, false);
    host.allyKill = false;
    const shares = sent.filter((m) => m.k === 'sk');
    expect(shares.map((m) => m.to).sort()).toEqual(['p1', 'p2', 'p3']);
    const each = shares[0]!.c!;
    expect(each).toBeGreaterThan(0);
    expect(shares.every((m) => m.c === each)).toBe(true);
    // the full reward is the share times three plus what rounding dropped (under one share per player)
    sent.length = 0;
    const solo = new SessionSim({ seed: 3, kind: 'mission', map: 'sakura', send: (to, d) => sent.push({ to, ...(d as { k: string }) }) });
    solo.players([{ id: 'p1', name: 'One' }]);
    solo.begin();
    solo.message('p1', { k: 'p', x: 0, y: 0, z: 0, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    const z2 = solo.zombies.spawn('shambler', 0, 0, (solo as unknown as { rng: never }).rng, {});
    const h2 = solo as unknown as typeof host;
    sent.length = 0;
    h2.allyKill = true;
    h2.onKill(z2, false);
    const full = sent.find((m) => m.k === 'sk')!.c!;
    expect(each).toBe(Math.floor(full / 3));
    // no one was credited a kill of their own
    expect(shares.some((m) => m.k === 'kill')).toBe(false);
  }, 30000);
});
