/** Power-up drops: the drop roll and its pity timer, the bag, lifetimes and timers, and what each one does. */
import { describe, expect, it } from 'vitest';
import { GRENADE } from '../src/config';
import { createInventory } from '../src/logic/economy';
import { POWERUPS } from '../src/logic/powerupConfig';
import {
  POWERUP_KINDS,
  applyPowerup,
  cashMultiplier,
  createPowerups,
  dropChance,
  dropVisible,
  effectOf,
  filterDamage,
  nextKind,
  nukeTargets,
  refillAll,
  resetPowerups,
  rollDrop,
  takeDropAt,
  tickPowerups,
} from '../src/logic/powerups';
import { Rng } from '../src/logic/rng';

const any = { eligible: true, carpenter: true };

describe('power-up drops', () => {
  it('starts at the base chance, climbs after the pity start and is certain by the pity max', () => {
    expect(dropChance(0)).toBeCloseTo(POWERUPS.baseChance);
    expect(dropChance(POWERUPS.pityStart)).toBeCloseTo(POWERUPS.baseChance);
    expect(dropChance(POWERUPS.pityStart + 10)).toBeCloseTo(POWERUPS.baseChance + 10 * POWERUPS.pityGain);
    expect(dropChance(POWERUPS.pityMax - 1)).toBe(1);
  });

  it('never goes longer than the pity max without a drop, and averages close to the configured rate', () => {
    const s = createPowerups();
    const rng = new Rng(42);
    let drops = 0;
    let longest = 0;
    let dry = 0;
    const kills = 20000;
    for (let i = 0; i < kills; i++) {
      const d = rollDrop(s, rng, 0, 0, any);
      if (d) {
        drops++;
        longest = Math.max(longest, dry);
        dry = 0;
        s.drops.length = 0; // taken at once
      } else dry++;
    }
    expect(longest).toBeLessThan(POWERUPS.pityMax);
    const rate = drops / kills;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.05);
  });

  it('is deterministic with the same seed', () => {
    const run = (): string => {
      const s = createPowerups();
      const rng = new Rng(7);
      const out: string[] = [];
      for (let i = 0; i < 400; i++) {
        const d = rollDrop(s, rng, i, -i, any);
        if (d) {
          out.push(`${i}:${d.kind}`);
          s.drops.length = 0;
        }
      }
      return out.join(',');
    };
    expect(run()).toBe(run());
    expect(run().length).toBeGreaterThan(0);
  });

  it('bosses and carriers never drop; nothing drops while the ground is full', () => {
    const s = createPowerups();
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) expect(rollDrop(s, rng, 0, 0, { eligible: false, carpenter: true })).toBeNull();
    // force drops with the pity timer until the ground is full
    s.dry = POWERUPS.pityMax;
    for (let i = 0; i < POWERUPS.maxOnGround; i++) {
      s.dry = POWERUPS.pityMax;
      expect(rollDrop(s, rng, 0, 0, any)).not.toBeNull();
    }
    s.dry = POWERUPS.pityMax;
    expect(rollDrop(s, rng, 0, 0, any)).toBeNull();
    expect(s.drops.length).toBe(POWERUPS.maxOnGround);
  });

  it('deals every kind once per cycle, and leaves the Carpenter out when nothing needs fixing', () => {
    const s = createPowerups();
    const rng = new Rng(3);
    const cycle = POWERUP_KINDS.map(() => nextKind(s, rng, { carpenter: true }));
    expect([...cycle].sort()).toEqual([...POWERUP_KINDS].sort());
    const t = createPowerups();
    for (let i = 0; i < 40; i++) expect(nextKind(t, rng, { carpenter: false })).not.toBe('carpenter');
  });

  it('floats for its lifetime, blinks at the end, and is taken by walking through it', () => {
    const s = createPowerups();
    s.dry = POWERUPS.pityMax;
    const d = rollDrop(s, new Rng(9), 10, 10, any)!;
    expect(dropVisible(d, 0)).toBe(true);
    tickPowerups(s, POWERUPS.lifetime - 1);
    // blinking: lit some instants, dark others
    const lit = Array.from({ length: 40 }, (_, i) => dropVisible(d, i * 0.025));
    expect(lit.some((v) => v)).toBe(true);
    expect(lit.some((v) => !v)).toBe(true);
    expect(takeDropAt(s, 0, 0)).toBeNull();
    expect(takeDropAt(s, 10.5, 10.4)?.id).toBe(d.id);
    expect(s.drops.length).toBe(0);
    // one left alone expires
    s.dry = POWERUPS.pityMax;
    rollDrop(s, new Rng(9), 0, 0, any);
    const { expired } = tickPowerups(s, POWERUPS.lifetime + 0.1);
    expect(expired.length).toBe(1);
    expect(s.drops.length).toBe(0);
  });
});

describe('power-up effects', () => {
  it('double points doubles cash for 30 s; taking another restarts the clock', () => {
    const s = createPowerups();
    expect(cashMultiplier(s)).toBe(1);
    applyPowerup(s, 'doublePoints');
    expect(cashMultiplier(s)).toBe(2);
    tickPowerups(s, 20);
    applyPowerup(s, 'doublePoints');
    expect(s.timers.doublePoints).toBe(POWERUPS.timed);
    const { ended } = tickPowerups(s, POWERUPS.timed + 0.01);
    expect(ended).toEqual(['doublePoints']);
    expect(cashMultiplier(s)).toBe(1);
  });

  it('insta-kill makes any hit lethal except on bosses and carriers', () => {
    const s = createPowerups();
    const grunt = { hp: 500, isBoss: false, curable: false };
    expect(filterDamage(s, 20, grunt)).toBe(20);
    applyPowerup(s, 'instaKill');
    expect(filterDamage(s, 20, grunt)).toBeGreaterThan(500);
    expect(filterDamage(s, 20, { hp: 500, isBoss: true, curable: false })).toBe(20);
    expect(filterDamage(s, 20, { hp: 500, isBoss: false, curable: true })).toBe(20);
    expect(filterDamage(s, 0, grunt)).toBe(0);
    tickPowerups(s, POWERUPS.timed);
    expect(filterDamage(s, 20, grunt)).toBe(20);
  });

  it('the nuke kills every living infected but bosses and carriers, and pays its cash', () => {
    const e = effectOf('nuke');
    expect(e.killAll).toBe(true);
    expect(e.cash).toBe(POWERUPS.nukeCash);
    const list = [
      { alive: true, isBoss: false, curable: false },
      { alive: false, isBoss: false, curable: false },
      { alive: true, isBoss: true, curable: false },
      { alive: true, isBoss: false, curable: true },
      { alive: true, isBoss: false, curable: false },
    ];
    expect(nukeTargets(list)).toEqual([0, 4]);
  });

  it('the carpenter repairs everything and pays; max ammo fills every reserve and the grenades', () => {
    const c = effectOf('carpenter');
    expect(c.repairAll).toBe(true);
    expect(c.cash).toBe(POWERUPS.carpenterCash);
    const inv = createInventory();
    inv.slots[0]!.ammo.reserve = 0;
    inv.slots[0]!.ammo.mag = 3;
    inv.slots[1]!.ammo.reserve = 1;
    inv.grenades = 0;
    expect(effectOf('maxAmmo').refillAmmo).toBe(true);
    expect(refillAll(inv)).toBeGreaterThan(0);
    for (const w of inv.slots) expect(w!.ammo.reserve).toBe(w!.ammo.reserveMax);
    expect(inv.slots[0]!.ammo.mag).toBe(3);
    expect(inv.grenades).toBe(GRENADE.max);
    // the plain ones have no clock
    expect(effectOf('maxAmmo').timed).toBeNull();
    expect(effectOf('instaKill').timed?.duration).toBe(POWERUPS.timed);
  });

  it('state is plain data (survives a JSON round trip) and resets clean', () => {
    const s = createPowerups();
    s.dry = POWERUPS.pityMax;
    rollDrop(s, new Rng(4), 1, 2, any);
    applyPowerup(s, 'instaKill');
    const copy = JSON.parse(JSON.stringify(s));
    expect(copy).toEqual(s);
    resetPowerups(s);
    expect(s.drops).toEqual([]);
    expect(s.timers).toEqual({ instaKill: 0, doublePoints: 0 });
    expect(s.dry).toBe(0);
  });
});
