import { describe, expect, it } from 'vitest';
import { FORGE_VARIANT_COUNT, buildForgeVariant } from '../src/enemies/zombie/forge';
import type { ZombieType } from '../src/types';

describe("the Forge's infected looks", () => {
  it('builds every variant, the Infernus included, as a sound skinned mesh', () => {
    for (const type of ['shambler', 'runner', 'armored', 'warden'] as ZombieType[]) {
      for (let i = 0; i < FORGE_VARIANT_COUNT[type]; i++) {
        const g = buildForgeVariant(type, i);
        const pos = g.attributes.position!;
        expect(pos.count, `${type} ${i}`).toBeGreaterThan(500);
        expect(g.attributes.skinIndex?.count ?? pos.count, `${type} ${i} skin`).toBe(pos.count);
        for (let v = 0; v < pos.count; v += 97) expect(Number.isFinite(pos.getX(v) + pos.getY(v) + pos.getZ(v))).toBe(true);
        g.dispose();
      }
    }
  });

  it('gives the Infernus a body of its own, bigger than any armored infected', () => {
    const boss = buildForgeVariant('warden', 0);
    const armored = buildForgeVariant('armored', 0);
    boss.computeBoundingBox();
    armored.computeBoundingBox();
    expect(boss.boundingBox!.max.y).toBeGreaterThan(armored.boundingBox!.max.y + 0.3);
    expect(boss.attributes.position!.count).not.toBe(armored.attributes.position!.count);
  });
});
