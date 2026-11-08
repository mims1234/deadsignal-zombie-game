/**
 * The Asylum's black fog wears down everyone in it: the infected slowly (a share of their full health per second, and
 * no one's kill), the squad through their armour. Driven through the co-op simulation.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { FOG } from '../src/asylum/nightConfig';
import { fogAt, inFog } from '../src/asylum/story';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { ASYLUM } from '../src/world/layout/asylum';

describe('the black fog', () => {
  function setup(elapsed: number) {
    const sim = new SessionSim({ seed: 4, kind: 'mission', map: 'asylum', send: () => {} });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const host = sim as unknown as { elapsed: number; onKill(z: unknown, head: boolean): void };
    host.elapsed = elapsed;
    let kills = 0;
    const onKill = host.onKill.bind(sim);
    host.onKill = (z, head) => {
      kills++;
      onKill(z, head);
    };
    // the player stands in the fog too (the simulation leaves the player's own burn to their client)
    const at = { x: ASYLUM.stack.x, z: ASYLUM.stack.z + 8 };
    const ids: number[] = [];
    // the squad keeps its guns down here: only the fog touches the infected
    for (const a of sim.debug.allies) a.stats = { ...a.stats, range: 0 };
    const run = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds * 30); i++) {
        if (i % 3 === 0) sim.message('p1', { k: 'p', x: at.x, y: 0, z: at.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
        // only the infected this test placed
        for (const z of [...sim.zombies.zombies]) if (!z.isBoss && !ids.includes(z.id)) sim.zombies.remove(z);
        sim.tick(1 / 30);
      }
    };
    return { sim, run, ids, kills: () => kills };
  }

  it('eats the infected in it slowly, as no one kill, and spares those outside', () => {
    const { sim, run, ids, kills } = setup(FOG.first + FOG.rise + 2);
    const fog = fogAt(FOG.first + FOG.rise + 2, null)!;
    expect(fog.radius).toBeGreaterThan(20);
    const rng = new Rng(3);
    const near = sim.zombies.spawn('shambler', ASYLUM.stack.x + 3, ASYLUM.stack.z + 3, rng, { state: 'idle' });
    const far = sim.zombies.spawn('shambler', ASYLUM.stack.x + fog.radius + 25, ASYLUM.stack.z, rng, { state: 'idle' });
    ids.push(near.id, far.id);
    run(5);
    // about 5 s of the share, not much more (it may wander a little)
    const lost = 1 - near.hp / near.maxHp;
    expect(lost).toBeGreaterThan(FOG.infectedShare * 3.5);
    expect(lost).toBeLessThan(FOG.infectedShare * 6);
    expect(far.hp).toBe(far.maxHp);
    // long enough in it, it dies, and nobody is credited
    run(40);
    expect(near.alive).toBe(false);
    expect(kills()).toBe(0);
  });

  it('hurts the squad standing in it', () => {
    const { sim, run } = setup(FOG.first + FOG.rise + 2);
    const vance = sim.debug.allies.find((a) => a.name === 'Vance')!;
    run(1);
    vance.ref.x = ASYLUM.stack.x + 2;
    vance.ref.z = ASYLUM.stack.z + 6;
    const before = vance.hp;
    run(3);
    expect(inFog(vance.ref.x, vance.ref.z, ASYLUM.stack, fogAt(FOG.first + FOG.rise + 6, null)!.radius)).toBe(true);
    expect(vance.hp).toBeLessThan(before - FOG.dps * vance.stats.damageTaken * 2);
  });

  it('hurts no one between waves', () => {
    const { sim, run, ids } = setup(FOG.first - 30);
    const z = sim.zombies.spawn('shambler', ASYLUM.stack.x + 3, ASYLUM.stack.z + 3, new Rng(5), { state: 'idle' });
    ids.push(z.id);
    run(3);
    expect(z.hp).toBe(z.maxHp);
    // (that one out of the way, so it cannot bite him)
    ids.length = 0;
    const vance = sim.debug.allies.find((a) => a.name === 'Vance')!;
    run(0.5);
    vance.ref.x = ASYLUM.stack.x + 2;
    vance.ref.z = ASYLUM.stack.z + 6;
    const before = vance.hp;
    run(3);
    expect(vance.hp).toBeGreaterThanOrEqual(before);
  });
});
