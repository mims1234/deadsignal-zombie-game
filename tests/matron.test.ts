import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { ZOMBIE_DIFFICULTY, ZOMBIES } from '../src/config';
import { MATRON, MATRON_DEF, shriekAlert } from '../src/enemies/matron';
import type { NetZombie, Zombie } from '../src/enemies/zombie';
import { ZombieManager } from '../src/enemies/zombieManager';
import { Rng } from '../src/logic/rng';
import { NIGHTFALL, PHASE_TUNING } from '../src/asylum/nightConfig';
import { createNullRigFactory } from '../src/sim/nullRig';
import { LIFE, SessionSim, type SessionDifficulty } from '../src/sim/serverHost';
import type { MapId } from '../src/world/layout/data';

function setup(map: MapId = 'asylum', difficulty?: SessionDifficulty) {
  const sim = new SessionSim({ seed: 11, map, difficulty, send() {} });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  const st = sim.level.data.playerStart;
  const where = { x: st.x, z: st.z };
  const run = (seconds: number): void => {
    for (let i = 0; i < seconds * 30; i++) {
      if (i % 3 === 0) sim.message('p1', { k: 'p', x: where.x, y: 0, z: where.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
      sim.tick(1 / 30);
    }
  };
  // she only walks at night: start the Asylum's run at nightfall (one tick wakes her at her post)
  if (map === 'asylum') {
    sim.debug.setElapsed(NIGHTFALL);
    run(1 / 30);
  }
  return { sim, where, run };
}

describe('the Matron', () => {
  it('is the boss of the Asylum, at her post, with her own stats; the other maps keep the Warden', () => {
    const { sim } = setup();
    const boss = sim.zombies.boss!;
    expect(boss).toBeTruthy();
    expect(boss.isBoss).toBe(true);
    expect(boss.type).toBe('warden'); // she animates (and is reported) as one
    expect(boss.def).toBe(MATRON_DEF);
    expect(boss.def.name).toBe('THE MATRON');
    expect(boss.rig.height).toBe(MATRON_DEF.height);
    expect(boss.maxHp).toBe(MATRON_DEF.hp);
    const h = sim.level.data.hunt;
    expect(Math.hypot(boss.x - h.wardenX, boss.z - h.wardenZ)).toBeLessThan(0.01);
    expect(sim.zombies.matron).not.toBeNull();

    const district = setup('district');
    expect(district.sim.zombies.boss!.def).toBe(ZOMBIES.warden);
    expect(district.sim.zombies.matron).toBeNull();
  });

  it('is tougher than the Warden on Normal and scales with the difficulty like every infected', () => {
    // effective health against body shots and against headshots
    expect(MATRON_DEF.hp / MATRON_DEF.bodyMul).toBeGreaterThan(ZOMBIES.warden.hp / ZOMBIES.warden.bodyMul);
    expect(MATRON_DEF.hp / MATRON_DEF.headMul).toBeGreaterThan(ZOMBIES.warden.hp / ZOMBIES.warden.headMul);
    // (and, like every infected on the hill, with the night on top)
    const n = PHASE_TUNING.night;
    for (const d of ['easy', 'normal', 'hard', 'nightmare'] as const) {
      const boss = setup('asylum', { zombies: d, team: 'regular' }).sim.zombies.boss!;
      const t = ZOMBIE_DIFFICULTY[d];
      expect(boss.maxHp).toBeCloseTo(MATRON_DEF.hp * t.hp * n.hp);
      expect(boss.dmgScale).toBeCloseTo(t.damage * n.damage);
      expect(boss.speedScale).toBeCloseTo(t.speed * n.speed);
      expect(boss.sightScale).toBeCloseTo(t.sight * n.sight);
    }
  });

  it('a safety-net respawn and a co-op puppet are her too', () => {
    const { sim } = setup();
    const again = sim.zombies.spawnWarden(new Rng(3));
    expect(again.def).toBe(MATRON_DEF);
    // a guest's manager on the Asylum builds her for the host's boss, and her shriek reaches it through the flags
    const guest = new ZombieManager(createNullRigFactory(), sim.level);
    const shrieks: number[] = [];
    guest.matron!.fx = { shriek: (x) => shrieks.push(x), keys() {} };
    const n: NetZombie = { id: 9, type: 'warden', x: 0, z: -33.5, yaw: 0, mode: 'idle', actionT: 0, staggerT: 0, speed: 0, hp: 1, flags: 0, carrier: 0, fy: 0, fp: 0, fr: 0 };
    guest.syncPuppets([n], new Rng(1));
    expect(guest.boss?.def).toBe(MATRON_DEF);
    expect(guest.boss?.rig.height).toBe(MATRON_DEF.height);
    const env = (sim as unknown as { makeEnv: (...a: unknown[]) => Parameters<ZombieManager['updatePuppets']>[1] }).makeEnv({ x: 0, y: 0, z: 0, eyeY: 1.6, alive: true, sprinting: false }, null, () => {});
    guest.updatePuppets(1 / 30, env);
    expect(shrieks.length).toBe(0);
    guest.syncPuppets([{ ...n, mode: 'roar', flags: 32 }], new Rng(1));
    guest.updatePuppets(1 / 30, env);
    guest.updatePuppets(1 / 30, env);
    expect(shrieks.length).toBe(1);
  });

  it('her shriek sends the idle infected within 40 m after the player, and tells co-op guests', () => {
    const { sim, where, run } = setup();
    run(0.5);
    const boss = sim.zombies.boss!;
    const near = sim.zombies.zombies.filter((q) => q !== boss && q.alive && q.state === 'idle' && Math.hypot(q.x - boss.x, q.z - boss.z) < MATRON.shriekRadius - 2);
    expect(near.length).toBeGreaterThan(3);
    // the player is far off; she hears something and cries out
    boss.hear(where.x, where.z, 0.05);
    let flagged = false;
    for (let i = 0; i < 30 && sim.zombies.matron!.shrieks === 0; i++) {
      run(1 / 30);
      flagged ||= (boss.toNet().flags & 32) !== 0;
    }
    expect(sim.zombies.matron!.shrieks).toBe(1);
    run(1 / 30);
    expect((boss.toNet().flags & 32) !== 0 || flagged).toBe(true);
    run(2.5);
    const roused = near.filter((q) => q.state !== 'idle');
    expect(roused.length).toBe(near.length);
  });

  it('the shriek alert is pure logic: idle and in range only', () => {
    const { sim } = setup();
    const all = sim.zombies.zombies;
    const boss = sim.zombies.boss!;
    const inRange = all.filter((q) => q !== boss && q.state === 'idle' && Math.hypot(q.x - boss.x, q.z - boss.z) <= 25).length;
    const n = shriekAlert(all as Zombie[], boss.x, boss.z, 0, 0, 25, boss.id);
    expect(n).toBe(inRange);
  });

  it('walks her rounds through the isolation block and along the back walk when she has seen nobody', () => {
    const { sim, run } = setup();
    const boss = sim.zombies.boss!;
    const R = MATRON.route;
    const visited = new Set<number>();
    let far = 0;
    for (let t = 0; t < 90; t++) {
      run(1);
      expect(boss.state).toBe('idle');
      expect(sim.zombies.matron!.offRoute(boss)).toBe(false);
      far = Math.max(far, Math.hypot(boss.x - R[0]!.x, boss.z - R[0]!.z));
      R.forEach((s, i) => {
        if (Math.hypot(boss.x - s.x, boss.z - s.z) < 1.5) visited.add(i);
      });
    }
    expect(far).toBeGreaterThan(10); // out along the back walk
    expect(visited.size).toBeGreaterThan(R.length * 0.6);
  });

  it('her route is walkable and stays inside the search area', () => {
    const { sim } = setup();
    const w = sim.level.world;
    const nav = sim.level.nav;
    const h = sim.level.data.hunt;
    const R = MATRON.route;
    for (let i = 0; i < R.length; i++) {
      const a = R[i]!;
      const b = R[(i + 1) % R.length]!;
      expect(nav.isBlockedAt(a.x, a.z), `stop ${i}`).toBe(false);
      expect(Math.hypot(a.x - h.searchX, a.z - h.searchZ), `stop ${i}`).toBeLessThan(h.searchRadius + 9);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const px = (-(b.z - a.z) / len) * MATRON_DEF.radius * 0.9;
      const pz = ((b.x - a.x) / len) * MATRON_DEF.radius * 0.9;
      for (const s of [-1, 0, 1]) expect(w.segmentBlocked(a.x + px * s, 0.9, a.z + pz * s, b.x + px * s, 0.9, b.z + pz * s, 'move'), `leg ${i} (${s})`).toBe(false);
    }
  });

  it('puts the lights out around her', () => {
    const { sim, run } = setup();
    run(0.2);
    const m = sim.zombies.matron!;
    const b = sim.zombies.boss!;
    let dimmest = 1;
    for (let i = 0; i < 20; i++) {
      run(0.05);
      dimmest = Math.min(dimmest, m.lampDim(b.x + 2, b.z));
    }
    expect(dimmest).toBeLessThan(0.5);
    expect(m.lampDim(b.x + 60, b.z)).toBe(1);
  });
});
