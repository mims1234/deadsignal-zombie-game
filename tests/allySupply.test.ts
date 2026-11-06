/**
 * The squad fends for itself on the Asylum (`game/allySupply.ts`): their own guns, magazines, reloads and reserves; a
 * wallet of their own for ammo at the wall chalks; one gun each from a supply box. Elsewhere they are as they were.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { makeAllyBody, SOLDIER_STATS, teamStats } from '../src/game/allyBrain';
import { ALLY_GUN, ALLY_SUPPLY, ammoPrice, kitFired, kitPaid, kitReady, makeKit, setGun } from '../src/game/allySupply';
import { LIFE, SessionSim } from '../src/sim/serverHost';

describe('a squad member’s own gun', () => {
  it('empties its magazine, reloads from the reserve, and runs dry', () => {
    const k = makeKit('pistol', teamStats(SOLDIER_STATS, 'regular'));
    expect(k.mag).toBe(ALLY_GUN.pistol.mag);
    expect(k.reserve).toBe(ALLY_GUN.pistol.reserve);
    for (let i = 0; i < ALLY_GUN.pistol.mag; i++) {
      expect(kitReady(k, 0.01)).toBe(true);
      kitFired(k);
    }
    // empty: reloading, no shot until it is done
    expect(kitReady(k, 0.01)).toBe(false);
    expect(kitReady(k, ALLY_GUN.pistol.reload)).toBe(true);
    expect(k.mag).toBe(ALLY_GUN.pistol.mag);
    expect(k.reserve).toBe(ALLY_GUN.pistol.reserve - ALLY_GUN.pistol.mag);
    // everything fired: dry for good
    while (k.mag + k.reserve > 0) {
      if (kitReady(k, 5)) kitFired(k);
    }
    expect(kitReady(k, 5)).toBe(false);
    // nothing in the hands: never fires
    setGun(k, 'none');
    expect(kitReady(k, 5)).toBe(false);
    // their own kills fill their wallet (a share), and ammo costs what the player pays
    kitPaid(k, 100);
    expect(k.wallet).toBe(ALLY_SUPPLY.wallet + 100 * ALLY_SUPPLY.walletShare);
    expect(ammoPrice('rifle')).toBe(750);
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
    // the gun they start with keeps their old numbers
    const plain = teamStats(SOLDIER_STATS, 'regular');
    expect(vance.stats.fireInterval).toBeCloseTo(plain.fireInterval, 9);
    expect(vance.stats.range).toBeCloseTo(plain.range, 9);
    const district = new SessionSim({ seed: 2, kind: 'mission', map: 'district', send: () => {} });
    expect(makeAllyBody(district.level, 'Dr. Lena Ortiz', 'survivor', 0, 0, 0, { x: 0, z: 2 }, true, 0).kit).toBeUndefined();
  });
});

describe('the squad on its errands (co-op simulation)', () => {
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

  it('one low on ammo walks to the chalk and buys it with their own money', () => {
    const { sim, at, run, vance, out } = setup();
    at.x = -3;
    at.z = 23;
    run(0.5);
    const k = vance.kit!;
    // a pistol, nearly empty, the money for ammo
    vance.stats = setGun(k, 'pistol');
    k.mag = 2;
    k.reserve = 3;
    k.wallet = 1000;
    k.boxes = sim.level.data.crates.map((c) => c.id); // (every box pulled already: this is about the ammo)
    vance.ref.x = -2;
    vance.ref.z = 25;
    run(15);
    expect(k.reserve).toBe(ALLY_GUN.pistol.reserve);
    expect(k.wallet).toBe(1000 - ammoPrice('pistol'));
    expect(out.some((m) => m.d.k === 'note' && String(m.d.t).includes('BOUGHT AMMO'))).toBe(true);
  });

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
});
