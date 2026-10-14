import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { ASYLUM_VARIANT_COUNT, asylumDims, buildAsylumVariant } from '../src/enemies/zombie/asylum';
import { NB } from '../src/enemies/zombie/dims';
import { VARIANT_COUNT, buildVariant, dimsFor } from '../src/enemies/zombie/variants';
import { ZombieManager } from '../src/enemies/zombieManager';
import type { ZombieFactory, ZombieRig, ZombieTheme } from '../src/enemies/zombieRigTypes';
import { createNullRigFactory } from '../src/sim/nullRig';
import { SessionSim } from '../src/sim/serverHost';
import type { ZombieType } from '../src/types';

/** Vertex count and a weighted checksum of positions and colours, taken before the Asylum looks were added. */
const BASELINE: Record<string, [number, number]> = {
  shambler0: [5926, 37103.957], shambler1: [5605, 34212.39], shambler2: [5540, 33705.919], shambler3: [4877, 33503.313], shambler4: [5810, 33269.577],
  shambler5: [6156, 32590.592], shambler6: [5880, 35140.457], shambler7: [4473, 24091.866], shambler8: [5605, 39599.721],
  runner0: [6159, 37290.69], runner1: [4923, 30060.055], runner2: [4447, 25987.535], runner3: [6041, 33607.354], runner4: [6017, 39118.23],
  armored0: [7385, 44061.531], armored1: [7367, 43454.695], armored2: [7385, 43924.71], armored3: [7385, 41463.532], warden0: [7881, 58688.686],
};

function checksum(g: { attributes: Record<string, { array: ArrayLike<number>; count: number }> }): [number, number] {
  const p = g.attributes.position!.array;
  const c = g.attributes.color!.array;
  let s = 0;
  for (let j = 0; j < p.length; j++) s += p[j]! * ((j % 7) + 1);
  for (let j = 0; j < c.length; j++) s += c[j]! * ((j % 5) + 1);
  return [g.attributes.position!.count, Math.round(s * 1000) / 1000];
}

const TYPES: ZombieType[] = ['shambler', 'runner', 'armored'];

describe("Blackwood's lost: the Asylum's infected looks", () => {
  it('leaves the District / Forge variants exactly as they were', () => {
    for (const t of [...TYPES, 'warden'] as ZombieType[]) {
      for (let i = 0; i < VARIANT_COUNT[t]; i++) expect(checksum(buildVariant(t, i) as never), `${t}${i}`).toEqual(BASELINE[`${t}${i}`]);
    }
  });

  it('builds every Asylum look on the same skeleton, at a similar cost', () => {
    expect(ASYLUM_VARIANT_COUNT.shambler).toBeGreaterThanOrEqual(6);
    expect(ASYLUM_VARIANT_COUNT.runner).toBeGreaterThanOrEqual(4);
    expect(ASYLUM_VARIANT_COUNT.armored).toBeGreaterThanOrEqual(2);
    for (const t of TYPES) {
      const D = asylumDims(t);
      expect(D.H).toBeLessThan(dimsFor(t).H); // a little shorter
      expect(D.shX).toBeLessThan(dimsFor(t).shX); // narrower shoulders
      for (let i = 0; i < ASYLUM_VARIANT_COUNT[t]; i++) {
        const g = buildAsylumVariant(t, i);
        const n = g.attributes.position!.count;
        expect(n, `${t}${i}`).toBeGreaterThan(2500);
        expect(n, `${t}${i}`).toBeLessThan(11000);
        const si = g.attributes.skinIndex!;
        let max = 0;
        for (let j = 0; j < si.count * 4; j++) max = Math.max(max, si.array[j]!);
        expect(max).toBeLessThan(NB);
        const pa = g.attributes.position!.array;
        for (let j = 0; j < pa.length; j++) expect(Number.isFinite(pa[j]!)).toBe(true);
        g.computeBoundingBox();
        expect(g.boundingBox!.max.y).toBeLessThan(D.H + 0.25);
        g.dispose();
      }
    }
  });

  it('the manager asks for the Asylum looks on the Asylum only (puppets included)', () => {
    const asked: (ZombieTheme | undefined)[] = [];
    const nul = createNullRigFactory();
    const spy: ZombieFactory = {
      create: (type, seed, theme) => {
        asked.push(theme);
        return nul.create(type, seed, theme) as ZombieRig;
      },
      createMatron: (seed) => nul.createMatron!(seed),
      dispose() {},
    };
    const sim = new SessionSim({ seed: 3, map: 'asylum', send() {} });
    const m = new ZombieManager(spy, sim.level);
    expect(m.theme).toBe('asylum');
    m.syncPuppets([{ id: 1, type: 'runner', x: 0, z: 10, yaw: 0, mode: 'idle', actionT: 0, staggerT: 0, speed: 0, hp: 1, flags: 0, carrier: 0, fy: 0, fp: 0, fr: 0 }], { f: () => 0.5 } as never);
    expect(asked).toEqual(['asylum']);
    const district = new ZombieManager(spy, new SessionSim({ seed: 3, map: 'district', send() {} }).level);
    expect(district.theme).toBeUndefined();
  });
});
