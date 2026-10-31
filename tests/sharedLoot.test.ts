import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { ECONOMY, MYSTERY_BOX } from '../src/config';
import { Rng } from '../src/logic/rng';
import { BOX_PHASE, createLoot, decodePrize, encodePrize, openBox, pickDrop, rollKillDrop, takeBox, tickLoot } from '../src/logic/sharedLoot';
import { LIFE, SessionSim } from '../src/sim/serverHost';

describe('co-op loot rules', () => {
  it('a box goes to whoever opens it first, and only they can take the prize', () => {
    const s = createLoot(2);
    expect(openBox(s, 0, 'a', 'w:shotgun')).toBe(true);
    expect(openBox(s, 0, 'b', 'ammo')).toBe(false); // too late
    tickLoot(s, MYSTERY_BOX.spin + 0.01);
    expect(s.boxes[0]!.phase).toBe(BOX_PHASE.offer);
    expect(takeBox(s, 0, 'b')).toBe(false);
    expect(takeBox(s, 0, 'a')).toBe(true);
    expect(s.boxes[0]!.phase).toBe(BOX_PHASE.gone);
    // an untaken prize sinks back
    openBox(s, 1, 'b', 'g2');
    tickLoot(s, MYSTERY_BOX.spin + MYSTERY_BOX.offer + 0.1);
    tickLoot(s, MYSTERY_BOX.offer + 0.1);
    expect(s.boxes[1]!.phase).toBe(BOX_PHASE.gone);
  });

  it('a paid box is one player at a time, and closes again for the next turn', () => {
    const s = createLoot(2, [true, false]);
    expect(openBox(s, 0, 'a', 'ammo')).toBe(true);
    expect(openBox(s, 0, 'b', 'ammo')).toBe(false); // a's turn: b waits
    tickLoot(s, MYSTERY_BOX.spin + 0.01);
    expect(takeBox(s, 0, 'a')).toBe(true);
    expect(openBox(s, 0, 'b', 'ammo')).toBe(false); // still closing
    tickLoot(s, MYSTERY_BOX.paidRearm + 0.01);
    expect(s.boxes[0]).toMatchObject({ phase: BOX_PHASE.closed, owner: null });
    expect(openBox(s, 0, 'b', 'g2')).toBe(true); // b's turn
    // a free box stays gone
    openBox(s, 1, 'a', 'ammo');
    tickLoot(s, MYSTERY_BOX.spin + 0.01);
    takeBox(s, 1, 'a');
    tickLoot(s, 60);
    expect(s.boxes[1]!.phase).toBe(BOX_PHASE.gone);
  });

  it('prizes survive the trip as text', () => {
    for (const p of [{ kind: 'ammo' } as const, { kind: 'grenades', count: 2 } as const, { kind: 'weapon', id: 'rpg' } as const]) expect(decodePrize(encodePrize(p))).toEqual(p);
    expect(decodePrize('w:laser')).toBeNull();
    expect(openBox(createLoot(1), 0, 'a', 'nonsense')).toBe(false);
  });

  it('a drop goes to the first player who walks over it, and fades in time', () => {
    const s = createLoot(0);
    const rng = new Rng(1);
    const d = rollKillDrop(s, 10, 10, 1, rng)!;
    expect(d).not.toBeNull();
    expect(pickDrop(s, d.id, 30, 30)).toBeNull(); // too far
    expect(pickDrop(s, d.id, 10.5, 10)).not.toBeNull();
    expect(pickDrop(s, d.id, 10, 10)).toBeNull(); // already gone
    rollKillDrop(s, 0, 0, 1, rng);
    tickLoot(s, ECONOMY.pickupLifetime + 1);
    expect(s.drops.length).toBe(0);
  });
});

describe('co-op loot in the simulation', () => {
  it('opens a box for the first player at it, tells only them, and shows it to everyone', () => {
    const out: { to: string; d: Record<string, unknown> }[] = [];
    const sim = new SessionSim({ seed: 5, map: 'district', send: (to, d) => out.push({ to, d }) });
    sim.players([{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }]);
    sim.begin();
    const c = sim.level.data.crates[0]!;
    const at = (id: string, x: number, z: number): void => sim.message(id, { k: 'p', x, y: 0, z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    at('p1', c.x + 1, c.z);
    at('p2', c.x - 1, c.z);
    for (let i = 0; i < 5; i++) sim.tick(1 / 30);
    sim.message('p2', { k: 'box', i: 0, pz: 'w:rifle' }, false);
    sim.message('p1', { k: 'box', i: 0, pz: 'ammo' }, false);
    expect(out.filter((m) => m.d.k === 'boxed').map((m) => m.to)).toEqual(['p2']);
    for (let i = 0; i < 12; i++) sim.tick(1 / 30);
    const s = [...out].reverse().find((m) => m.d.k === 's')!.d as { bx: (number | string)[][] };
    expect(s.bx[0]![0]).toBe(BOX_PHASE.spin);
    expect(s.bx[0]![1]).toBe('p2');
    expect(s.bx[0]![2]).toBe('w:rifle');
  });
});
