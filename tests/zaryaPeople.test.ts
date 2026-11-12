/**
 * ZARYA's people (`src/zarya/people.ts`): everyone who speaks has a name, a colour and a portrait; everyone met and
 * everything learned about them comes from a line that is really said; the sleepers the story names stand where it
 * says.
 */
import '../src/sim/stubs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LINES, NINA_WIRE, SACK_MOVED, type Speaker } from '../src/zarya/lines';
import { Acquaintance, PEOPLE, faceOf, namedSleepers } from '../src/zarya/people';

/** Every line the game can say, as [speaker, text]. */
const ALL: (readonly [string, string])[] = [...Object.values(LINES).flat(), ...Object.values(SACK_MOVED), ...NINA_WIRE.map((t) => ['NINA', t] as const)];
const SPEAKERS: Speaker[] = ['MIRA', 'TIMUR', 'VERA', 'NINA', 'KOSTYA', 'ZINA', 'ZIMIN', 'YAGA'];

describe('ZARYA people', () => {
  it('gives every speaker a name, a colour and a portrait that exists', () => {
    for (const s of SPEAKERS) {
      const f = faceOf(s);
      expect(f, s).not.toBeNull();
      expect(f!.name.length).toBeGreaterThan(2);
      expect(f!.short.length).toBeLessThanOrEqual(9);
      expect(f!.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const p of PEOPLE) expect(existsSync(`public/zarya/people/${p.id}.webp`), p.id).toBe(true);
    expect(faceOf('COMMAND')).toBeNull();
  });

  it('meets everyone and learns every fact from a line that is really said', () => {
    for (const p of PEOPLE) {
      if (p.met) expect(ALL.some(([, t]) => p.met!.test(t)), `${p.id} is never named`).toBe(true);
      p.facts.forEach((f, i) => {
        if (f.on) expect(ALL.some(([, t]) => f.on!.test(t)), `${p.id} fact ${i} is never said`).toBe(true);
      });
    }
    // the whole script, said in order: everyone is met, everything is known, each speaker carded once
    const k = new Acquaintance();
    const cards: string[] = [];
    for (const [who, text] of ALL) {
      const c = k.heard(who, text);
      if (c) cards.push(c);
    }
    expect(k.met.length).toBe(PEOPLE.length);
    expect(new Set(cards).size).toBe(cards.length);
    expect(cards.sort()).toEqual(['kostya', 'lyudmila', 'mira', 'nina', 'timur', 'vera', 'zimin', 'zina']);
    for (const p of PEOPLE) expect(k.facts(p.id).length).toBe(p.facts.length);
  });

  it('knows only what has been said so far', () => {
    const k = new Acquaintance();
    expect(k.heard('VERA', LINES.arrive[0][1])).toBe('vera');
    expect(k.has('babushka')).toBe(true);
    expect(k.has('nina')).toBe(false);
    expect(k.facts('vera').length).toBe(1);
    expect(k.heard('VERA', LINES.arrive[1][1])).toBeNull();
    k.heard('NINA', LINES.hall[3][1]);
    expect(k.has('gena')).toBe(true);
    expect(k.facts('gena').length).toBe(1);
    k.reset();
    expect(k.met.length).toBe(0);
  });

  it('puts a name over each sleeper the story names, and only them', () => {
    const named = namedSleepers();
    const count = (id: string): number => named.filter((n) => n.id === id).length;
    expect(count('lida')).toBe(1);
    expect(count('sorokins')).toBe(5);
    for (const id of ['nina', 'kostya', 'zina', 'babushka', 'danya']) expect(count(id), id).toBe(1);
    // the Sorokins are by the slide, Lida by the tea kiosk
    for (const n of named.filter((q) => q.id === 'sorokins')) expect(Math.hypot(n.p.x + 40, n.p.z - 33)).toBeLessThan(8);
    const lida = named.find((q) => q.id === 'lida')!;
    expect(Math.hypot(lida.p.x - 22.5, lida.p.z + 21)).toBeLessThan(8);
  });
});
