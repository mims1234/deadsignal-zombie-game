/**
 * Aurelia as an NPC (`aurelia/brain.ts`), run by the co-op session simulation the way the solo game runs her: she walks
 * ahead of the nearest player, the infected hunt her, and she cannot die - she falls, lies in the ash (longer each death
 * in a row; infected on the ash hold her down), and rises in a burst that throws back everything near her.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { AURELIA_NPC as N } from '../src/config';
import { type Aurelia, type AureliaRow, ashTime, aureliaHurt } from '../src/aurelia/brain';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';

type Msg = { to: string; d: Record<string, unknown> };

function setup() {
  const out: Msg[] = [];
  const sim = new SessionSim({ seed: 5, kind: 'mission', map: 'aurelia', send: (to, d) => out.push({ to, d }) });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  const st = sim.level.data.playerStart;
  const me = { x: st.x, z: st.z, yaw: st.yaw };
  const run = (seconds: number): void => {
    for (let i = 0; i < seconds * 30; i++) {
      if (i % 3 === 0) sim.message('p1', { k: 'p', x: me.x, y: 0, z: me.z, yaw: me.yaw, up: true, st: LIFE.up, hp: 100 }, false);
      sim.tick(1 / 30);
    }
  };
  const her = (): Aurelia => (sim as unknown as { aurelia: Aurelia }).aurelia;
  const row = (): AureliaRow => [...out].reverse().find((m) => m.d.k === 's' && m.d.au)!.d.au as AureliaRow;
  // nobody else in the way: no residents, no squad
  for (const q of [...sim.zombies.zombies]) sim.zombies.remove(q);
  (sim as unknown as { allies: unknown[] }).allies = [];
  return { sim, me, run, her, row };
}

describe('Aurelia as an NPC', () => {
  it('lies in the ash longer for every death in a row: 8, 12, 18, 27, then never more than 30 seconds', () => {
    expect([1, 2, 3, 4, 5, 6].map(ashTime)).toEqual([8, 12, 18, 27, 30, 30]);
  });

  it('walks a few steps ahead of the player, and is in every co-op report', () => {
    const { me, run, her, row } = setup();
    run(1);
    // the player walks up the valley; she keeps ahead of them
    for (let i = 0; i < 8; i++) {
      me.z -= 1;
      run(0.5);
    }
    const a = her();
    expect(a.phase).toBe('lead');
    expect(Math.hypot(a.ref.x - me.x, a.ref.z - me.z)).toBeLessThan(7);
    expect(a.ref.z).toBeLessThan(me.z + 1); // ahead (north, the way they walk)
    const r = row();
    expect(r[0]).toBeCloseTo(a.ref.x, 0);
    expect(r[3]).toBe(0); // on her feet
  });

  it('cannot die: killed, she falls, lies in the ash, rises, and leads again at full health', () => {
    const { run, her, row } = setup();
    run(0.5);
    const a = her();
    const fell = aureliaHurt(a, 1e6, a.ref.x + 1, a.ref.z);
    expect(fell).toEqual({ kind: 'fell', deaths: 1, ashFor: N.ashFirst });
    expect(a.ref.alive).toBe(false);
    // hits while she is down do nothing
    expect(aureliaHurt(a, 1e6, a.ref.x + 1, a.ref.z)).toBeNull();
    run(N.fall + 1);
    expect(a.phase).toBe('ash');
    expect(row()[3]).toBe(2);
    expect(row()[4]).toBeGreaterThan(N.ashFirst - 2);
    run(N.ashFirst);
    expect(a.phase).toBe('rising');
    run(N.rise);
    expect(a.phase).toBe('lead');
    expect(a.ref.alive).toBe(true);
    expect(a.hp).toBe(N.hp);
    // a second death soon after lies longer
    aureliaHurt(a, 1e6, a.ref.x + 1, a.ref.z);
    expect(a.ashFor).toBe(ashTime(2));
  });

  it('rises in a burst that throws back and hurts the infected around her', () => {
    const { sim, run, her } = setup();
    run(0.5);
    const a = her();
    aureliaHurt(a, 1e6, a.ref.x + 1, a.ref.z);
    run(N.fall + N.ashFirst - 0.2);
    const z = sim.zombies.spawn('runner', a.ref.x + 3, a.ref.z, new Rng(3), { state: 'idle' });
    z.hp = z.maxHp = 1e6;
    const hp0 = z.hp;
    const d0 = Math.hypot(z.x - a.ref.x, z.z - a.ref.z);
    run(N.burstAt + 0.6);
    expect(z.hp).toBeLessThan(hp0);
    expect(Math.hypot(z.x - a.ref.x, z.z - a.ref.z)).toBeGreaterThan(d0);
  });

  it('is held down by the infected standing on her ashes', () => {
    const { sim, run, her } = setup();
    run(0.5);
    const a = her();
    aureliaHurt(a, 1e6, a.ref.x + 1, a.ref.z);
    run(N.fall + 0.1);
    // five of them on the ash, too slow to wander off
    for (let i = 0; i < 5; i++) {
      const z = sim.zombies.spawn('shambler', a.ref.x + Math.cos(i) * 0.8, a.ref.z + Math.sin(i) * 0.8, new Rng(10 + i), { state: 'idle' });
      z.hp = z.maxHp = 1e6;
      z.speedScale = 0;
    }
    run(N.ashFirst + 0.5);
    expect(a.phase).toBe('ash'); // held back by up to 60%: still lying there
  });

  it('starts the count again after she has stood long enough', () => {
    const { run, her } = setup();
    run(0.5);
    const a = her();
    aureliaHurt(a, 1e6, a.ref.x + 1, a.ref.z);
    run(N.fall + N.ashFirst + N.rise + 0.5);
    expect(a.phase).toBe('lead');
    a.upT = N.forgiveAfter + 1;
    expect(aureliaHurt(a, 1e6, a.ref.x + 1, a.ref.z)).toEqual({ kind: 'fell', deaths: 1, ashFor: N.ashFirst });
  });
});
