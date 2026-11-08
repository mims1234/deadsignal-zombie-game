import { describe, expect, it } from 'vitest';
import { ALLY_SPACE, type AllyBody, allySpread } from '../src/game/allyBrain';
import type { Level } from '../src/world/level';

const level = { world: { resolveCircle: () => {}, floorBelow: (_x: number, _z: number, _r: number, y: number) => y } } as unknown as Level;
const ally = (x: number, z: number, extra: Partial<AllyBody> = {}): AllyBody => ({ ref: { x, y: 0, z, eyeY: 1.6, alive: true, sprinting: false }, trapped: false, ...extra }) as AllyBody;
const dist = (a: AllyBody, b: { x: number; z: number }): number => Math.hypot(a.ref.x - b.x, a.ref.z - b.z);
const settle = (allies: AllyBody[], players: { x: number; y: number; z: number }[]): void => {
  for (let i = 0; i < 120; i++) allySpread(allies, players, level, 1 / 60);
};

describe('allySpread', () => {
  it('parts allies who stand inside each other, even on the very same spot', () => {
    const a = ally(0, 0);
    const b = ally(0.1, 0);
    const c = ally(0.1, 0);
    settle([a, b, c], []);
    for (const [p, q] of [[a, b], [a, c], [b, c]] as const) expect(dist(p, q.ref)).toBeGreaterThan(ALLY_SPACE.ally - 0.05);
  });

  it('moves an ally out of the player, never the player', () => {
    const p = { x: 0, y: 0, z: 0 };
    const a = ally(0.2, 0.1);
    settle([a], [p]);
    expect(dist(a, p)).toBeGreaterThan(ALLY_SPACE.player - 0.05);
    expect(p).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('undoes a body overlap at once, eases the rest of the margin, and leaves the trapped and other floors alone', () => {
    const a = ally(0, 0);
    const b = ally(0.2, 0);
    allySpread([a, b], [], level, 1 / 60);
    expect(dist(a, b.ref)).toBeGreaterThanOrEqual(ALLY_SPACE.hardAlly - 1e-9);
    expect(dist(a, b.ref)).toBeLessThan(ALLY_SPACE.ally - 0.05);
    const caged = ally(0, 0, { trapped: true });
    const other = ally(0.1, 0);
    const up = ally(0, 0.1);
    up.ref.y = 3;
    settle([caged, other, up], []);
    expect(caged.ref.x).toBe(0);
    expect(up.ref.z).toBe(0.1);
  });
});
