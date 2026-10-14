/**
 * The Asylum's barricades: the pure rules (tear, repair, pay cap), the windows found on the real map, and the infected
 * walking to a window, tearing it open and climbing in - headless, on the real colliders.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { BARRICADE } from '../src/asylum/barricadeConfig';
import { BarricadeDirector, type BarricadeEvent } from '../src/asylum/barricadeDirector';
import { findBarricades, indoors, sideOf } from '../src/asylum/barricadeLayout';
import { anyDamaged, createBarricades, createPurse, isOpen, payRepair, repairAll, repairBoard, resetBarricades, tearStep } from '../src/asylum/barricades';
import type { ZombieEnv } from '../src/enemies/zombie';
import { ZombieManager } from '../src/enemies/zombieManager';
import { Rng } from '../src/logic/rng';
import { createNullRigFactory } from '../src/sim/nullRig';
import { SessionSim } from '../src/sim/serverHost';
import { FlowField } from '../src/world/nav';

describe('barricade rules', () => {
  it('tears one board per tearTime, stops at zero, and the window is then open', () => {
    const s = createBarricades(2);
    expect(s.boards).toEqual([BARRICADE.boards, BARRICADE.boards]);
    let off = 0;
    for (let i = 0; i < 1000; i++) if (tearStep(s, 0, 0.05)) off++;
    expect(off).toBe(BARRICADE.boards);
    expect(isOpen(s, 0)).toBe(true);
    expect(isOpen(s, 1)).toBe(false);
    // exactly 1 s per board at rate 1
    const t = createBarricades(1);
    expect(tearStep(t, 0, 0.99)).toBe(false);
    expect(tearStep(t, 0, 0.02)).toBe(true);
    expect(t.boards[0]).toBe(BARRICADE.boards - 1);
    // a faster tearer
    const r = createBarricades(1);
    expect(tearStep(r, 0, 0.5, 2)).toBe(true);
  });

  it('repairs one board at a time up to full, the Carpenter fixes everything', () => {
    const s = createBarricades(3);
    expect(repairBoard(s, 0)).toBe(false); // already full
    s.boards[0] = 0;
    s.boards[2] = 4;
    expect(anyDamaged(s)).toBe(true);
    expect(repairBoard(s, 0)).toBe(true);
    expect(s.boards[0]).toBe(1);
    expect(repairBoard(s, 9)).toBe(false);
    expect(repairAll(s)).toBe(BARRICADE.boards - 1 + 2);
    expect(anyDamaged(s)).toBe(false);
    s.boards[1] = 2;
    resetBarricades(s);
    expect(s.boards.every((b) => b === BARRICADE.boards)).toBe(true);
  });

  it('pays $10 a board, double with double points, capped and refilling over time', () => {
    const p = createPurse(0);
    let total = 0;
    for (let i = 0; i < 20; i++) total += payRepair(p, 0);
    expect(total).toBe(BARRICADE.payCap); // farming a window right away pays the cap and no more
    expect(payRepair(p, 0)).toBe(0);
    // after the window the purse is full again
    expect(payRepair(p, BARRICADE.payWindow)).toBe(BARRICADE.repairPay);
    // a partial refill pays what has come back
    const q = createPurse(0);
    for (let i = 0; i < 20; i++) payRepair(q, 0);
    const back = (BARRICADE.payCap / BARRICADE.payWindow) * 5;
    expect(payRepair(q, 5)).toBe(Math.min(BARRICADE.repairPay, Math.floor(back)));
    // double points doubles the pay, not the cap
    const d = createPurse(0);
    expect(payRepair(d, 0, 2)).toBe(BARRICADE.repairPay * 2);
  });
});

describe('the Asylum barricades on the real map', () => {
  const level = new SessionSim({ map: 'asylum', send: () => {} }).level;
  const defs = findBarricades(level.world, level.nav);
  const field = new FlowField(level.nav);
  field.compute(level.data.playerStart.x, level.data.playerStart.z);

  it('finds 10-14 boarded windows, each with a reachable inside and a reachable spawn outside', () => {
    expect(defs.length).toBeGreaterThanOrEqual(10);
    expect(defs.length).toBeLessThanOrEqual(14);
    for (const d of defs) {
      const name = `window ${d.id} (${d.x.toFixed(1)}, ${d.z.toFixed(1)})`;
      expect(sideOf(d, d.outX, d.outZ), name).toBeGreaterThan(0);
      expect(sideOf(d, d.spawnX, d.spawnZ), name).toBeGreaterThan(2);
      expect(sideOf(d, d.inX, d.inZ), name).toBeLessThan(0);
      expect(field.isReachable(d.inX, d.inZ), `${name} inside`).toBe(true);
      expect(field.isReachable(d.spawnX, d.spawnZ), `${name} spawn`).toBe(true);
      expect(level.nav.isBlockedAt(d.spawnX, d.spawnZ), `${name} spawn free`).toBe(false);
      expect(indoors(defs, d.inX, d.inZ), name).toBe(true);
      expect(indoors(defs, d.spawnX, d.spawnZ), name).toBe(false);
    }
  });

  it('a player cannot walk or jump through a barricade, boards or not', () => {
    for (const d of defs) {
      // straight through the middle of the opening at chest height, and at sill height (a jump)
      expect(level.world.segmentBlocked(d.inX, 1.2, d.inZ, d.outX, 1.2, d.outZ, 'move')).toBe(true);
      expect(level.world.segmentBlocked(d.inX, 2.0, d.inZ, d.outX, 2.0, d.outZ, 'move')).toBe(true);
      // ...but bullets fly through the opening
      expect(level.world.segmentBlocked(d.x - d.nx, 1.9, d.z - d.nz, d.x + d.nx, 1.9, d.z + d.nz, 'shots')).toBe(false);
      // and the circle a player is pushed out of covers the whole opening
      expect(level.world.circleBlocked(d.x, d.z, 0.34, 1.5, 3)).toBe(true);
    }
  });

  it('an infected sent to a window walks there, tears every board, climbs in and hunts inside', () => {
    const zombies = new ZombieManager(createNullRigFactory(), level);
    const dir = new BarricadeDirector(defs, zombies);
    const events: BarricadeEvent[] = [];
    dir.onEvent = (e) => events.push(e);
    const silent: unknown = new Proxy({}, { get: () => () => undefined });
    // a west-ward window; the player waits inside, back from it
    const d = defs.find((q) => q.x < -20)!;
    const px = d.inX - d.nx * 3;
    const pz = d.inZ - d.nz * 3;
    const pf = new FlowField(level.nav);
    pf.compute(px, pz);
    let hurt = 0;
    const env: ZombieEnv = {
      time: 0,
      world: level.world,
      nav: level.nav,
      field: pf,
      player: { x: px, y: 0, z: pz, eyeY: 1.6, alive: true, sprinting: false },
      rng: new Rng(5),
      audio: silent as never,
      fx: silent as never,
      hurtPlayer: (a) => (hurt += a),
      alertNear: () => {},
      shake: () => {},
    };
    const z = zombies.spawn('shambler', d.spawnX, d.spawnZ, new Rng(9), { yaw: 0 });
    expect(dir.attach(z, d.id)).toBe(true);
    let climbedAt = -1;
    let maxLift = 0;
    for (let i = 0; i < 60 * 40 && climbedAt < 0; i++) {
      env.time = i / 60;
      zombies.update(1 / 60, env, true);
      dir.update();
      maxLift = Math.max(maxLift, z.scriptPose.lift);
      if (events.some((e) => e.kind === 'climb')) climbedAt = i / 60;
    }
    expect(events.filter((e) => e.kind === 'tear').length).toBe(BARRICADE.boards);
    expect(dir.state.boards[d.id]).toBe(0);
    expect(climbedAt).toBeGreaterThan(BARRICADE.boards * BARRICADE.tearTime);
    expect(maxLift).toBeGreaterThan(d.sill - 0.05);
    expect(z.script).toBeNull();
    expect(sideOf(d, z.x, z.z)).toBeLessThan(0); // inside
    expect(z.state).toBe('chase');
    expect(dir.queueLength(d.id)).toBe(0);
    // it then reaches the player on the normal AI
    for (let i = 0; i < 60 * 6; i++) {
      env.time += 1 / 60;
      zombies.update(1 / 60, env, true);
    }
    expect(hurt).toBeGreaterThan(0);
  });

  it('repairing while an infected is at the window: it keeps tearing; killed on the sill, the body falls', () => {
    const zombies = new ZombieManager(createNullRigFactory(), level);
    const dir = new BarricadeDirector(defs, zombies);
    const silent: unknown = new Proxy({}, { get: () => () => undefined });
    const d = defs[0]!;
    const env: ZombieEnv = {
      time: 0,
      world: level.world,
      nav: level.nav,
      field: new FlowField(level.nav),
      player: { x: d.inX - d.nx * 4, y: 0, z: d.inZ - d.nz * 4, eyeY: 1.6, alive: true, sprinting: false },
      rng: new Rng(6),
      audio: silent as never,
      fx: silent as never,
      hurtPlayer: () => {},
      alertNear: () => {},
      shake: () => {},
    };
    const z = zombies.spawn('shambler', d.outX + d.nx * 0.2, d.outZ + d.nz * 0.2, new Rng(2), { yaw: 0 });
    dir.attach(z, d.id);
    const step = (s: number): void => {
      for (let i = 0; i < s * 60; i++) {
        env.time += 1 / 60;
        zombies.update(1 / 60, env, true);
        dir.update();
      }
    };
    step(3.5);
    const after = dir.state.boards[d.id]!;
    expect(after).toBeLessThan(BARRICADE.boards);
    repairBoard(dir.state, d.id);
    repairBoard(dir.state, d.id);
    step(2.2);
    expect(dir.state.boards[d.id]!).toBeLessThan(after + 2); // still at it
    // run to the climb and kill it on the sill
    for (let i = 0; i < 60 * 20 && !(z.script && z.scriptPose.lift > 0.8); i++) step(1 / 60);
    expect(z.scriptPose.lift).toBeGreaterThan(0.8);
    zombies.damage(z, 1e6, false, env, 0);
    expect(z.alive).toBe(false);
    step(0.1);
    expect(z.script).toBeNull();
    dir.update();
    expect(dir.queueLength(d.id)).toBe(0);
    step(2);
    expect(z.rig.root.position.y).toBeLessThan(0.05);
  });
});
