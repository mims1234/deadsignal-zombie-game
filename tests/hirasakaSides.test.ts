import { describe, expect, it } from 'vitest';
import { LINE } from '../src/hirasaka/lines';
import { COMB, JOBS, PHOTOS, SIDE as SIDE_BIT, TAPES } from '../src/hirasaka/places';
import { SIDE_MODELS } from '../src/hirasaka/sideModels';
import { SIDE, SIDE_PLACES, SIDE_THINGS, sideCan, sideChanges, sideDone, sideEmpty, sideIndex, sideJournal, sideNext, sideOf, sideRow, sideShown } from '../src/hirasaka/sides';
import { decodeStory, encodeStory, HirasakaStory } from '../src/hirasaka/story';

const keys = [...TAPES.map((t, i) => ({ id: `tape${i}`, at: t })), ...PHOTOS.map((p, i) => ({ id: `photo${i}`, at: p })), { id: 'cageKey', at: JOBS.key.key }, { id: 'boilerKey', at: JOBS.steam.boilerKey }, { id: 'comb', at: COMB }];

describe('HIRASAKA side stories', () => {
  it('are ten, in the order of the story bits, each a few steps', () => {
    expect(SIDE.map((q) => q.id)).toEqual(['barber', 'ferry', 'fishpool', 'cats', 'reel', 'letters', 'okoze', 'tanko', 'drums', 'riceball']);
    SIDE.forEach((q, s) => {
      expect(SIDE_BIT[q.id]).toBe(s);
      expect(q.stages.length).toBeGreaterThanOrEqual(2);
      for (const st of q.stages) expect(st.places.length).toBeLessThanOrEqual(4);
      expect(q.reward.cash ?? 0).toBeLessThanOrEqual(600);
    });
  });

  it('say only lines that exist, every one voiced, from the right speakers', () => {
    const ids = new Set<string>();
    for (const q of SIDE) for (const st of q.stages) {
      st.lines.forEach((l) => ids.add(l));
      for (const p of st.places) (p.lines ?? []).forEach((l) => ids.add(l));
    }
    for (const id of ids) {
      expect(LINE[id], id).toBeTruthy();
      expect(LINE[id]!.fresh, id).toBeFalsy(); // (final polish) hs-voices has voiced them all (was: every one fresh)
      expect(['NATSUKI', 'DAIGO', 'GENZO', 'MIO']).toContain(LINE[id]!.who);
    }
  });

  it('never time anything: holds are short and nothing is missable', () => {
    for (const q of SIDE_PLACES) expect(q.p.hold ?? 0).toBeLessThanOrEqual(1);
  });

  it('stand every place and thing at least 8 m from any tape, photo or key', () => {
    const spots = [...SIDE_PLACES.map((q) => ({ id: `${SIDE[q.s]!.id}:${q.stage}.${q.k}`, x: q.p.at.x, z: q.p.at.z })), ...SIDE_THINGS.map((t) => ({ id: t.key, x: t.x, z: t.z }))];
    for (const s of spots) for (const k of keys) expect(Math.hypot(s.x - k.at.x, s.z - k.at.z), `${s.id} - ${k.id}`).toBeGreaterThanOrEqual(8);
  });

  it('draw every thing with a model of its own', () => {
    for (const t of SIDE_THINGS) expect(SIDE_MODELS[t.m], t.m).toBeTypeOf('function');
  });

  it('keep each story as stage * 16 + bits, any order inside a stage', () => {
    const letters = SIDE.findIndex((q) => q.id === 'letters');
    let sides = sideEmpty();
    expect(sideCan(sides, sideIndex(letters, 1, 0))).toBe(false);
    sides[letters] = sideNext(sides, sideIndex(letters, 0, 0));
    expect(sides[letters]).toBe(16);
    for (const k of [2, 0, 3, 1]) {
      expect(sideCan(sides, sideIndex(letters, 1, k))).toBe(true);
      sides = sides.map((n, s) => (s === letters ? sideNext(sides, sideIndex(letters, 1, k)) : n));
    }
    expect(sides[letters]).toBe(32);
    const ch = sideChanges(sideEmpty(), sides);
    expect(ch[0]!.found).toBe(true);
    expect(ch[0]!.lines).toContain('nat_sd_letterc');
    expect(sideOf(sideIndex(7, 5, 0))).toEqual({ s: 7, stage: 5, k: 0 });
  });

  it('play all ten through the story by standing at each place, and the rice ball opens ending 2', () => {
    const q = new HirasakaStory();
    // put the story where ending 2 would be asked: every photograph, the call, the climb
    Object.assign(q.view, { photos: 31, call: true, act: 2 });
    for (const pl of SIDE_PLACES) {
      // a step out of order is refused
      if (pl.stage > 0) expect(q.act('sidep', pl.i, { x: pl.p.at.x, y: pl.p.at.y, z: pl.p.at.z })).toBe(sideCan(q.view.sides, pl.i));
    }
    for (let s = 0; s < SIDE.length; s++) {
      for (const pl of SIDE_PLACES.filter((p) => p.s === s)) {
        // far away: no
        expect(q.act('sidep', pl.i, { x: pl.p.at.x + 20, y: pl.p.at.y, z: pl.p.at.z })).toBe(false);
        if (sideCan(q.view.sides, pl.i)) expect(q.act('sidep', pl.i, { x: pl.p.at.x + 1, y: pl.p.at.y, z: pl.p.at.z })).toBe(true);
      }
      expect(sideDone(q.view.sides, s)).toBe(true);
      expect(q.view.side & (1 << s)).not.toBe(0);
    }
    expect(HirasakaStory.canGoHome(q.view)).toBe(true);
    const ev = q.drain().filter((e) => e.kind === 'side');
    expect(ev.length).toBe(10);
  });

  it('send the stories on the wire after every older field', () => {
    const q = new HirasakaStory();
    q.view.sides = q.view.sides.map((_, s) => s * 16 + 1);
    const row = encodeStory(q.view);
    const back = decodeStory(row)!;
    expect(back.sides).toEqual(q.view.sides);
    expect(back.parts).toBe(q.view.parts);
    // a row from before the side stories: none begun
    expect(decodeStory(row.slice(0, row.length - 10))!.sides).toEqual(sideEmpty());
  });

  it('the old finishing hook finishes the whole story', () => {
    const q = new HirasakaStory();
    const rb = SIDE_BIT.riceball!;
    const s = SIDE_PLACES.find((p) => p.s === rb)!;
    expect(q.act('side', rb, { x: 498, y: 9, z: -58 })).toBe(true);
    expect(sideDone(q.view.sides, rb)).toBe(true);
    expect(q.act('sidep', s.i, s.p.at)).toBe(false);
  });

  it('show each thing until its place is done (and its after once it is); the HUD line and the journal follow', () => {
    const empty = sideShown(sideEmpty());
    SIDE_THINGS.forEach((t, j) => expect(empty[j], t.key).toBe(t.when !== 'after'));
    const done = sideShown(SIDE.map((q) => q.stages.length * 16));
    SIDE_THINGS.forEach((t, j) => expect(done[j], t.key).toBe(t.when !== 'before'));
    const sides = sideEmpty();
    expect(sideRow(sides, 0, 0, () => true)).toBeNull();
    sides[0] = 16;
    const row = sideRow(sides, 0, 0, () => true)!;
    expect(row.detail).toBe(SIDE[0]!.stages[1]!.hint);
    expect(sideJournal(sides)[0]!.rows.length).toBe(2);
  });
});
