/**
 * The phone's top line (`TopLineView` in `ui/hudFx.ts`): banners and radio arrive one short line at a time, cut at
 * word breaks into even pieces, with nothing lost and no stray last word.
 */
import { describe, expect, it } from 'vitest';
import { TopLineView } from '../src/ui/hudFx';

describe('the top line on phones', () => {
  const long = 'Whoever just set out from the landing... there are people caged all along the bank. They cannot get out with those things around them. Please do not leave them.';

  it('cuts a long line into pieces that fit, at word breaks, keeping every word in order', () => {
    const parts = TopLineView.pieces(long, 49);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(49);
    expect(parts.join(' ')).toBe(long.replace(/\s+/g, ' '));
  });

  it('evens the pieces out so the last is never one stray word', () => {
    const parts = TopLineView.pieces('Keep moving, they are coming up the street behind us.', 49);
    expect(parts.length).toBe(2);
    expect(parts[1]!.split(' ').length).toBeGreaterThan(1);
  });

  it('leaves a short line whole, and an empty one empty', () => {
    expect(TopLineView.pieces('Relay online.', 49)).toEqual(['Relay online.']);
    expect(TopLineView.pieces('', 49)).toEqual([]);
  });
});
