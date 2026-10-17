/**
 * The Sakura District's kinds of infected and the Kurenai Court (`enemies/variants.ts`), in the co-op simulation:
 * the Court stand off and shoot, the rooted wait under the petals, the stalker freezes while watched, a bloomed one's
 * cloud stings, and every kind reaches the guests (with the floor it stands on).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { VARIANTS } from '../src/enemies/variants';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';

function sakura(onSend?: (to: string, d: Record<string, unknown>) => void) {
  const sim = new SessionSim({ seed: 5, kind: 'mission', map: 'sakura', send: (to, d) => onSend?.(to, d as Record<string, unknown>) });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  (sim as unknown as { allies: unknown[] }).allies = [];
  for (const q of sim.zombies.zombies) if (q.active) sim.zombies.remove(q);
  return sim;
}

const stand = (sim: SessionSim, x: number, z: number, yaw = 0): void => sim.message('p1', { k: 'p', x, y: 0, z, yaw, up: true, st: LIFE.up, hp: 100 }, false);

describe('the Sakura District enemies', () => {
  it('the town is peopled with its kinds: the Court in the theatre and on the decks', () => {
    const sim = new SessionSim({ seed: 9, kind: 'mission', map: 'sakura', send() {} });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const kinds = new Map<string, number>();
    for (const z of sim.zombies.zombies) kinds.set(z.variant, (kinds.get(z.variant) ?? 0) + 1);
    expect(kinds.get('court') ?? 0).toBeGreaterThanOrEqual(8);
    expect(kinds.get('commuter') ?? 0).toBeGreaterThan(0);
    expect(kinds.get('empress')).toBe(1);
    const decks = sim.zombies.zombies.filter((z) => z.variant === 'court' && z.y > 4);
    expect(decks.length).toBe(4);
  });

  it('a Court rifleman keeps his distance and shoots', () => {
    let hurt = 0;
    const sim = sakura((to, d) => {
      if (d.k === 'hurt') hurt += Number(d.a);
    });
    stand(sim, -100, 30);
    const z = sim.zombies.spawn('shambler', -100, 48, new Rng(3), { state: 'chase', variant: 'court' });
    z.hp = z.maxHp = 1e9;
    let closest = Infinity;
    for (let f = 0; f < 30 * 20; f++) {
      if (f % 3 === 0) stand(sim, -100, 30);
      sim.tick(1 / 30);
      closest = Math.min(closest, Math.hypot(z.x + 100, z.z - 30));
    }
    expect(hurt).toBeGreaterThan(0);
    expect(closest).toBeGreaterThan(6);
  });

  it('a rooted one lies still until someone comes close', () => {
    const sim = sakura();
    stand(sim, 30, 60);
    const z = sim.zombies.spawn('runner', 30, 48, new Rng(3), { variant: 'rooted' });
    expect(z.buried).toBe(true);
    for (let f = 0; f < 60; f++) {
      if (f % 3 === 0) stand(sim, 30, 60);
      sim.tick(1 / 30);
    }
    expect(z.buried).toBe(true);
    expect(Math.hypot(z.x - 30, z.z - 48)).toBeLessThan(0.2);
    for (let f = 0; f < 30; f++) {
      if (f % 3 === 0) stand(sim, 30, 52);
      sim.tick(1 / 30);
    }
    expect(z.buried).toBe(false);
    expect(z.state === 'chase' || z.state === 'attack').toBe(true);
  });

  it('the stalker does not move while watched, and comes on when not', () => {
    const sim = sakura();
    // the player at (-100, 30) on the plaza; she is 16 m north (-Z), in plain sight
    const z = sim.zombies.spawn('runner', -100, 14, new Rng(3), { state: 'chase', variant: 'kuchisake' });
    z.hp = z.maxHp = 1e9;
    for (let f = 0; f < 60; f++) {
      if (f % 3 === 0) stand(sim, -100, 30, 0); // yaw 0 looks toward -Z: at her
      sim.tick(1 / 30);
    }
    const watched = Math.hypot(z.x + 100, z.z - 14);
    expect(watched).toBeLessThan(1.2);
    for (let f = 0; f < 60; f++) {
      if (f % 3 === 0) stand(sim, -100, 30, Math.PI); // turned away
      sim.tick(1 / 30);
    }
    expect(Math.hypot(z.x + 100, z.z - 14)).toBeGreaterThan(watched + 3);
  });

  it('a bloomed one\'s death cloud stings whoever stands in it', () => {
    let hurt = 0;
    const sim = sakura((to, d) => {
      if (d.k === 'hurt') hurt += Number(d.a);
    });
    stand(sim, -100, 30);
    const z = sim.zombies.spawn('shambler', -100, 31.5, new Rng(3), { variant: 'bloomed' });
    z.takeDamage(1e6, false, (sim as unknown as { peers: Map<string, { env: never }> }).peers.get('p1')!.env, 0);
    for (let f = 0; f < 90; f++) {
      if (f % 3 === 0) stand(sim, -100, 30);
      sim.tick(1 / 30);
    }
    expect(hurt).toBeGreaterThan(4);
  });

  it('guests are told each one\'s kind and the floor it stands on', () => {
    let last: number[][] = [];
    const sim = sakura((to, d) => {
      if (d.k === 's') last = d.z as number[][];
    });
    stand(sim, 92, -44);
    const z = sim.zombies.spawn('shambler', 98, -50, new Rng(3), { variant: 'court', y: 5.18, area: sim.level.floors.areas.findIndex((a) => a.name === 'freight deck 98') });
    for (let f = 0; f < 12; f++) {
      if (f % 3 === 0) stand(sim, 92, -44);
      sim.tick(1 / 30);
    }
    const row = last.find((r) => r[0] === z.id);
    expect(row).toBeDefined();
    expect(VARIANTS[row![17]!]).toBe('court');
    expect(row![16]).toBeCloseTo(5.2, 1);
  });
});
