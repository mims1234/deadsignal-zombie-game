import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { COOP } from '../src/config';
import { ServerHost } from '../src/sim/serverHost';

function setup() {
  const out: { to: string; d: Record<string, unknown> }[] = [];
  const host = new ServerHost({ seed: 7, send: (to, d) => out.push({ to, d }) });
  host.players([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }]);
  host.begin();
  const st = host.level.data.playerStart;
  const report = (id: string, up = true, dx = 0) => host.message(id, { k: 'p', x: st.x + dx, y: 0, z: st.z, yaw: 0, up, hp: 100 }, false);
  const run = (seconds: number, both = true) => {
    for (let i = 0; i < seconds * 30; i++) {
      if (i % 3 === 0) {
        report('p1');
        if (both) report('p2', true, 1.5);
      }
      host.tick(1 / 30);
    }
  };
  const last = (k: string) => [...out].reverse().find((m) => m.d.k === k);
  return { host, out, run, report, last };
}

describe('server-hosted co-op', () => {
  it('builds the map without a browser and waits for the first player', () => {
    const { host, out } = setup();
    for (let i = 0; i < 60; i++) host.tick(1 / 30);
    expect(host.level.data.spawnPoints.length).toBeGreaterThan(10);
    expect(host.stats().wave).toBe(0);
    // it still tells everyone the state of things
    expect(out.some((m) => m.d.k === 's')).toBe(true);
  });

  it('runs the waves for the players and attacks them', () => {
    const { out, run, last } = setup();
    run(COOP.firstBreak + 8);
    const s = last('s')!.d as { w: number[]; z: unknown[]; p: unknown[][] };
    expect(s.w[0]).toBe(1);
    expect(s.z.length).toBeGreaterThan(0);
    expect(s.p.map((r) => r[0]).sort()).toEqual(['p1', 'p2']);
    run(40);
    expect(out.some((m) => m.d.k === 'hurt' && (m.to === 'p1' || m.to === 'p2'))).toBe(true);
  });

  it('applies a player hit, credits the kill to them, and clears waves', () => {
    const { host, out, run } = setup();
    run(COOP.firstBreak + 6);
    const z = host.zombies.zombies.find((q) => q.alive)!;
    host.message('p2', { k: 'hit', z: z.id, a: 590, h: true, y: 0 }, false);
    expect(z.alive).toBe(false);
    const kill = out.find((m) => m.d.k === 'kill');
    expect(kill?.to).toBe('p2');
    // everything dies: the wave ends and a break starts
    for (let i = 0; i < 200 && host.stats().wave === 1; i++) {
      for (const q of host.zombies.zombies) if (q.alive) host.message('p1', { k: 'hit', z: q.id, a: 590, h: false, y: 0 }, false);
      run(1);
      if (host.stats().phase === 'break') break;
    }
    expect(host.stats().phase).toBe('break');
  });

  it('ignores players it does not seat, and the owner restarts a finished run', () => {
    const { host, run, report } = setup();
    host.message('stranger', { k: 'p', x: 0, y: 0, z: 0, yaw: 0, up: true, hp: 100 }, false);
    expect(host.stats().players).toBe(0);
    run(COOP.firstBreak + 4);
    // everyone goes down during a wave: lost
    report('p1', false);
    report('p2', false);
    for (let i = 0; i < 30; i++) host.tick(1 / 30);
    expect(host.finished).toBe(true);
    host.message('p1', { k: 'restart' }, true);
    expect(host.finished).toBe(false);
    expect(host.stats().wave).toBe(0);
  });
});
