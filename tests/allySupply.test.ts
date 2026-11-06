/**
 * The squad fends for itself on the Asylum (`game/allySupply.ts`): their own guns, magazines and reloads (ammunition
 * never runs out); one gun each from a supply box. Elsewhere they are as they were. A squad kill pays the player less
 * than their own kill would (`ECONOMY.squadKillShare`).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { makeAllyBody, SOLDIER_STATS, teamStats } from '../src/game/allyBrain';
import { ECONOMY } from '../src/config';
import { ALLY_GUN, boxGun, kitFired, kitReady, kitStats, makeKit, setGun } from '../src/game/allySupply';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';

describe('a squad member’s own gun', () => {
  it('empties its magazine and reloads - and never runs out', () => {
    const k = makeKit('pistol', teamStats(SOLDIER_STATS, 'regular'));
    expect(k.mag).toBe(ALLY_GUN.pistol.mag);
    for (let round = 0; round < 20; round++) {
      for (let i = 0; i < ALLY_GUN.pistol.mag; i++) {
        expect(kitReady(k, 0.01)).toBe(true);
        kitFired(k);
      }
      // empty: reloading, no shot until it is done (a magazine's worth of reload time, every time)
      expect(kitReady(k, 0.01)).toBe(false);
      expect(kitReady(k, ALLY_GUN.pistol.reload * 0.5)).toBe(false);
      expect(kitReady(k, ALLY_GUN.pistol.reload)).toBe(true);
      expect(k.mag).toBe(ALLY_GUN.pistol.mag);
    }
    // nothing in the hands: never fires
    setGun(k, 'none');
    expect(kitReady(k, 5)).toBe(false);
  });

  it('takes a gun from a box as that gun: its numbers, never the RPG', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 400; i++) expect(['pistol', 'shotgun', 'rifle']).toContain(boxGun(i % 2 ? 'none' : 'pistol', rng));
    const k = makeKit('pistol', teamStats(SOLDIER_STATS, 'regular'));
    const pistol = kitStats(k);
    const shotgun = setGun(k, 'shotgun');
    expect(k.mag).toBe(ALLY_GUN.shotgun.mag);
    expect(shotgun.fireInterval).toBeCloseTo(pistol.fireInterval * ALLY_GUN.shotgun.fire, 9);
    expect(shotgun.bodyDamage).toBeCloseTo(pistol.bodyDamage * ALLY_GUN.shotgun.damage, 9);
  });

  it('is the Asylum only: Vance a rifle, Okafor a shotgun, the unarmed nothing; elsewhere no kit', () => {
    const sim = new SessionSim({ seed: 2, kind: 'mission', map: 'asylum', send: () => {} });
    const lvl = sim.level;
    const vance = makeAllyBody(lvl, 'Vance', 'soldier', 0, 0, 0, { x: 0, z: 2 }, false, 0);
    const okafor = makeAllyBody(lvl, 'Okafor', 'soldier', 0, 0, 0, { x: 0, z: 2 }, false, 1);
    const pip = makeAllyBody(lvl, 'Pip Arden', 'survivor', 0, 0, 0, { x: 0, z: 2 }, true, 2);
    expect(vance.kit?.gun).toBe('rifle');
    expect(okafor.kit?.gun).toBe('shotgun');
    expect(pip.kit?.gun).toBe('none');
    expect(pip.stats.range).toBe(0);
    // who they are: Pip will not carry a gun, so she never takes one from a box (the armed survivors may)
    expect(pip.kit?.noGuns).toBe(true);
    expect(makeAllyBody(lvl, 'Nurse Halloway', 'survivor', 0, 0, 0, { x: 0, z: 2 }, true, 3).kit?.noGuns).toBe(false);
    // the gun they start with keeps their old numbers
    const plain = teamStats(SOLDIER_STATS, 'regular');
    expect(vance.stats.fireInterval).toBeCloseTo(plain.fireInterval, 9);
    expect(vance.stats.range).toBeCloseTo(plain.range, 9);
    const district = new SessionSim({ seed: 2, kind: 'mission', map: 'district', send: () => {} });
    expect(makeAllyBody(district.level, 'Dr. Lena Ortiz', 'survivor', 0, 0, 0, { x: 0, z: 2 }, true, 0).kit).toBeUndefined();
  });
});

describe('the squad on its errands (co-op simulation)', () => {
  it("waits its turn at a box: never during a player's spin, never two at once", () => {
    const { sim, at, run } = setup();
    at.x = 16;
    at.z = 40;
    run(0.5);
    const squad = sim.debug.allies.filter((a) => a.kit && !a.trapped);
    const box = sim.level.data.crates.findIndex((c) => Math.hypot(c.x - 18, c.z - 44) < 0.5);
    const loot = (sim as unknown as { loot: { boxes: { phase: number; t: number }[] } }).loot;
    for (const a of squad) {
      a.stats = setGun(a.kit!, 'none');
      a.kit!.boxes = sim.level.data.crates.filter((_, i) => i !== box).map((c) => c.id);
      a.ref.x = 15 + squad.indexOf(a);
      a.ref.z = 41;
    }
    // a player's reel on it the whole time: nobody pulls
    for (let i = 0; i < 12 * 30; i += 15) {
      loot.boxes[box]!.phase = 1;
      loot.boxes[box]!.t = 0;
      run(0.5);
    }
    expect(squad.every((a) => a.kit!.gun === 'none')).toBe(true);
    // free again: they take turns, one pull at a time
    loot.boxes[box]!.phase = 0;
    let together = false;
    for (let i = 0; i < 40; i++) {
      run(0.5);
      const at2 = squad.filter((a) => a.kit!.errand?.kind === 'box' && a.kit!.errand.workT > 0).length;
      if (at2 > 1) together = true;
    }
    expect(together).toBe(false);
    expect(squad.every((a) => a.kit!.gun !== 'none')).toBe(true);
  });

  function setup() {
    const out: { to: string; d: Record<string, unknown> }[] = [];
    const sim = new SessionSim({ seed: 9, kind: 'mission', map: 'asylum', send: (to, d) => out.push({ to, d }) });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const at = { x: 0, z: 30 };
    const run = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds * 30); i++) {
        if (i % 3 === 0) sim.message('p1', { k: 'p', x: at.x, y: 0, z: at.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
        // nobody to fight: the errands wait for quiet
        for (const z of [...sim.zombies.zombies]) if (!z.isBoss) sim.zombies.remove(z);
        sim.tick(1 / 30);
      }
    };
    const vance = sim.debug.allies.find((a) => a.name === 'Vance')!;
    return { sim, out, at, run, vance };
  }

  it('one with no gun takes one from a box nearby - once per box - and every client hears which', () => {
    const { at, run, vance, out } = setup();
    at.x = 16;
    at.z = 40;
    run(0.5);
    const k = vance.kit!;
    vance.stats = setGun(k, 'none');
    vance.ref.x = 15;
    vance.ref.z = 41;
    run(15);
    expect(k.gun).not.toBe('none');
    expect(k.boxes.length).toBeGreaterThanOrEqual(1);
    expect(vance.stats.range).toBeGreaterThan(0);
    expect(out.some((m) => m.d.k === 'note' && String(m.d.t).includes('FROM THE BOX'))).toBe(true);
    // the snapshot carries it
    const snap = [...out].reverse().find((m) => m.d.k === 's')!.d as { sq?: number[][] };
    const row = snap.sq!.find((r) => r[0] === 0 || r[0] === 1)!;
    expect(row.length).toBe(8);
  });

  it("pays the player less for a squad member's kill than for their own", () => {
    expect(ECONOMY.squadKillShare).toBeGreaterThan(0);
    expect(ECONOMY.squadKillShare).toBeLessThan(1);
    const { sim, out, run } = setup();
    run(0.5);
    out.length = 0;
    const z = sim.zombies.spawn('shambler', 4, 30, new Rng(3), { state: 'idle' });
    // the same infected, killed once by the squad and once by the player
    const host = sim as unknown as { allyKill: boolean; killer: string | null; onKill(z: unknown, head: boolean): void };
    host.allyKill = true;
    host.onKill(z, false);
    host.allyKill = false;
    host.killer = 'p1';
    host.onKill(z, false);
    const squad = Number(out.find((m) => m.d.k === 'sk')!.d.c);
    const own = Number(out.find((m) => m.d.k === 'kill')!.d.c);
    expect(squad).toBeGreaterThan(0);
    expect(squad).toBeLessThan(own);
    expect(squad).toBe(Math.floor(Math.round(own * ECONOMY.squadKillShare)));
  });
});
