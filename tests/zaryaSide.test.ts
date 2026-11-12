/**
 * ZARYA's side stories (`src/zarya/sidestories.ts`, the story's `side`): every place is in its zone and apart from the
 * main story's things, every story plays to its end in order and in no other, nothing can be done twice or missed,
 * the rewards land, the HUD line and the journal follow it, and it all goes on the co-op wire.
 */
import { describe, expect, it } from 'vitest';
import { LINES } from '../src/zarya/lines';
import { AT, CH, CLUES, COVERS, G, ZaryaStory, decodeStory, encodeStory } from '../src/zarya/story';
import { SIDE, SIDE_PLACES, sideChanges, sideDone, sideFound, sideIndex, sideJournal, sideMods, sidePrompts, sideRow, sideShown, sideStage } from '../src/zarya/sidestories';
import { SIDE_MODELS } from '../src/zarya/sideModels';

/** A story in Act II with every zone open (the tickets, the pond road, the checkpoint, the escalator, the three chains). */
function open(): ZaryaStory {
  const s = new ZaryaStory();
  const w = s as unknown as { ch: number; g: number };
  w.ch = CH.act2;
  w.g = G.tickets | G.pond | G.code | G.escalator;
  s.unlock.view.gates = 7;
  return s;
}

/** Plays story `s` to its end, standing on each place in turn; returns the events. */
function play(st: ZaryaStory, s: number): void {
  SIDE[s]!.stages.forEach((stage, k) => {
    stage.places.forEach((p, j) => {
      const i = sideIndex(s, k, j);
      expect(ZaryaStory.can(st.view, 'side', i), `${SIDE[s]!.id} ${k}.${j}`).toBe(true);
      expect(st.act('side', i, p.at)).toBe(true);
      // the same place twice does nothing
      expect(st.act('side', i, p.at)).toBe(false);
    });
  });
}

describe('ZARYA side stories: the data', () => {
  it('has about twelve stories, each with two to four stages and a payoff', () => {
    expect(SIDE.length).toBeGreaterThanOrEqual(11);
    expect(new Set(SIDE.map((q) => q.id)).size).toBe(SIDE.length);
    for (const q of SIDE) {
      expect(q.stages.length, q.id).toBeGreaterThanOrEqual(2);
      expect(q.stages.length, q.id).toBeLessThanOrEqual(7);
      expect(Object.keys(q.reward).length, q.id).toBeGreaterThan(0);
      expect(q.history.length, q.id).toBeGreaterThan(40);
      for (const st of q.stages) {
        expect(st.places.length).toBeGreaterThanOrEqual(1);
        expect(st.places.length).toBeLessThanOrEqual(4);
        expect(st.learn.length).toBeGreaterThan(10);
      }
      // the first stage's lines are what the squad notices; the last stage's are the payoff
      expect(q.stages[0]!.lines.length + (q.stages[0]!.places[0]!.lines?.length ?? 0), q.id).toBeGreaterThan(0);
      expect(q.stages[q.stages.length - 1]!.lines.length, q.id).toBeGreaterThan(0);
    }
  });

  it('puts every place in the zone it says, apart from the main story\'s own things', () => {
    const main = [...Object.values(AT), ...CLUES.map((c) => c.at), ...COVERS];
    for (const q of SIDE_PLACES) {
      expect(ZaryaStory.zoneOf(q.p.at.x, q.p.at.z), `${SIDE[q.s]!.id} ${q.stage}.${q.k}`).toBe(q.p.zone);
      for (const m of main) expect(Math.hypot(m.x - q.p.at.x, m.z - q.p.at.z), `${SIDE[q.s]!.id} ${q.stage}.${q.k}`).toBeGreaterThan(1.2);
    }
  });

  it('spreads across the town: one or two per zone', () => {
    const zones = new Map<string, number>();
    for (const q of SIDE) {
      const z = q.stages[0]!.places[0]!.zone;
      zones.set(z, (zones.get(z) ?? 0) + 1);
    }
    for (const n of zones.values()) expect(n).toBeLessThanOrEqual(2);
    expect(zones.size).toBeGreaterThanOrEqual(9);
  });

  it('speaks only with the main story\'s speakers, in lines a phone can read', () => {
    const speakers = new Set(Object.values(LINES).flatMap((l) => l.map((x) => x[0])));
    for (const q of SIDE)
      for (const st of q.stages)
        for (const [who, text] of [...st.lines, ...st.places.flatMap((p) => p.lines ?? [])]) {
          expect(speakers.has(who), `${q.id}: ${who}`).toBe(true);
          expect(text.split(/\s+/).length, text).toBeLessThanOrEqual(26);
        }
  });

  it('has a model for every thing it draws', () => {
    for (const q of SIDE_PLACES) {
      if (q.p.model) expect(SIDE_MODELS[q.p.model], q.p.model).toBeTypeOf('function');
      if (q.p.after) expect(SIDE_MODELS[q.p.after], q.p.after).toBeTypeOf('function');
    }
  });

});

describe('ZARYA side stories: playing them', () => {
  it('waits for the tram: nothing before Act II, nothing after the end', () => {
    const s = new ZaryaStory();
    expect(SIDE_PLACES.some((q) => ZaryaStory.can(s.view, 'side', q.i))).toBe(false);
    const e = open();
    (e as unknown as { ch: number }).ch = CH.ended;
    expect(SIDE_PLACES.some((q) => ZaryaStory.can(e.view, 'side', q.i))).toBe(false);
  });

  it('waits for each place\'s zone to open', () => {
    const s = new ZaryaStory();
    (s as unknown as { ch: number }).ch = CH.act2;
    const first = SIDE_PLACES.filter((q) => q.stage === 0 && q.k === 0);
    for (const q of first) {
      const want = ['square', 'store', 'rynok', 'dvor'].includes(q.p.zone);
      expect(ZaryaStory.can(s.view, 'side', q.i), SIDE[q.s]!.id).toBe(want);
    }
  });

  it('plays every story to its end, in order, by whoever stands at the place', () => {
    const s = open();
    SIDE.forEach((_, k) => {
      expect(sideFound(s.view.side, k)).toBe(false);
      play(s, k);
      expect(sideDone(s.view.side, k)).toBe(true);
    });
    const ev = s.drain().filter((e) => e.kind === 'side');
    expect(ev.length).toBe(SIDE_PLACES.length);
  });

  it('takes no step out of order and none from too far away', () => {
    const s = open();
    SIDE.forEach((q, k) => {
      const later = sideIndex(k, 1, 0);
      expect(ZaryaStory.can(s.view, 'side', later), q.id).toBe(false);
      const p = q.stages[0]!.places[0]!;
      expect(s.act('side', sideIndex(k, 0, 0), { x: p.at.x + 10, z: p.at.z })).toBe(false);
      expect(sideFound(s.view.side, k)).toBe(false);
    });
  });

  it('takes the pieces of a stage in any order', () => {
    const s = open();
    const k = SIDE.findIndex((q) => q.stages.some((st) => st.places.length > 1));
    const stage = SIDE[k]!.stages.findIndex((st) => st.places.length > 1);
    for (let st = 0; st < stage; st++) SIDE[k]!.stages[st]!.places.forEach((p, j) => s.act('side', sideIndex(k, st, j), p.at));
    const places = SIDE[k]!.stages[stage]!.places;
    for (let j = places.length - 1; j >= 0; j--) {
      expect(sideStage(s.view.side[k]!)).toBe(stage);
      expect(s.act('side', sideIndex(k, stage, j), places[j]!.at)).toBe(true);
    }
    expect(sideStage(s.view.side[k]!)).toBe(stage + 1);
  });

  it('gives a mod part the squad can spend, and keeps it through a reset only until reset', () => {
    const s = open();
    const k = SIDE.findIndex((q) => q.reward.mod);
    expect(k).toBeGreaterThanOrEqual(0);
    const before = ZaryaStory.modParts(s.view);
    play(s, k);
    expect(sideMods(s.view.side)).toBe(SIDE[k]!.reward.mod);
    expect(ZaryaStory.modParts(s.view)).toBe(before + SIDE[k]!.reward.mod!);
    s.reset();
    expect(s.view.side.every((n) => n === 0)).toBe(true);
  });

  it('goes on the co-op wire, and reads a row from before side stories', () => {
    const s = open();
    play(s, 0);
    play(s, 4);
    s.act('side', sideIndex(1, 0, 0), SIDE[1]!.stages[0]!.places[0]!.at);
    const row = encodeStory(s.view);
    expect(decodeStory(row)).toEqual(s.view);
    const old = decodeStory(row.slice(0, 14))!;
    expect(old.side).toEqual(SIDE.map(() => 0));
    expect(decodeStory([...row.slice(0, 14), -1])).toBeNull();
  });
});

describe('ZARYA side stories: the screen', () => {
  it('says each step\'s lines once, the pieces as they come, and the payoff once', () => {
    const s = open();
    let prev = s.view.side;
    let said = 0;
    let finished = 0;
    SIDE.forEach((q, k) => {
      q.stages.forEach((st, si) =>
        st.places.forEach((p, j) => {
          s.act('side', sideIndex(k, si, j), p.at);
          for (const c of sideChanges(prev, s.view.side)) {
            said += c.lines.length;
            if (c.finished) finished++;
          }
          prev = s.view.side;
        }),
      );
    });
    const all = SIDE.reduce((n, q) => n + q.stages.reduce((m, st) => m + st.lines.length + st.places.reduce((l, p) => l + (p.lines?.length ?? 0), 0), 0), 0);
    expect(said).toBe(all);
    expect(finished).toBe(SIDE.length);
  });

  it('shows on the HUD only once found, and only what is left', () => {
    const s = open();
    const openZ = (z: Parameters<typeof ZaryaStory.zoneOpen>[1]): boolean => ZaryaStory.zoneOpen(s.view, z);
    expect(sideRow(s.view.side, 0, 0, openZ)).toBeNull();
    const p0 = SIDE[0]!.stages[0]!.places[0]!;
    s.act('side', sideIndex(0, 0, 0), p0.at);
    const row = sideRow(s.view.side, p0.at.x, p0.at.z, openZ)!;
    expect(row.title).toBe(SIDE[0]!.title);
    expect(row.detail).toBe(SIDE[0]!.stages[1]!.hint);
    expect(row.at).toEqual(SIDE[0]!.stages[1]!.places[0]!.at);
    play2(s, 0, 1);
    expect(sideRow(s.view.side, 0, 0, openZ)).toBeNull();
  });

  it('keeps a journal section per story found, ending in the town\'s history', () => {
    const s = open();
    expect(sideJournal(s.view.side)).toEqual([]);
    play(s, 2);
    const j = sideJournal(s.view.side);
    expect(j).toHaveLength(1);
    expect(j[0]!.head).toContain(SIDE[2]!.title);
    expect(j[0]!.rows[j[0]!.rows.length - 1]).toBe(SIDE[2]!.history);
  });

  it('prompts at a place in reach, notes a place whose step has not come, and draws what stands there', () => {
    const s = open();
    const can = (i: number): boolean => ZaryaStory.can(s.view, 'side', i);
    const p0 = SIDE[0]!.stages[0]!.places[0]!;
    const here = sidePrompts(s.view.side, p0.at.x, p0.at.z, can, true);
    expect(here.some((q) => q.i === sideIndex(0, 0, 0) && q.text === p0.verb)).toBe(true);
    const early = SIDE_PLACES.find((q) => q.p.early)!;
    const there = sidePrompts(s.view.side, early.p.at.x, early.p.at.z, can, true);
    expect(there.some((q) => q.i === -1 && q.text === early.p.early![0])).toBe(true);
    expect(sidePrompts(s.view.side, p0.at.x, p0.at.z, can, false)).toEqual([]);
    // drawn from the tram's first run; a thing taken folds away, a thing left stays
    expect(sideShown(s.view.side, false).every((x) => !x.model && !x.after)).toBe(true);
    const gift = SIDE_PLACES.findIndex((q) => q.p.model === 'gift');
    expect(sideShown(s.view.side, true)[gift]!.model).toBe(true);
    play(s, 0);
    const shown = sideShown(s.view.side, true);
    expect(shown[gift]!.model).toBe(false);
    const left = SIDE_PLACES.findIndex((q) => q.s === 0 && q.stage === 2);
    expect(shown[left]!.after).toBe(true);
  });
});

/** Story `s` from stage `from` to its end. */
function play2(st: ZaryaStory, s: number, from: number): void {
  SIDE[s]!.stages.slice(from).forEach((stage, k) => stage.places.forEach((p, j) => st.act('side', sideIndex(s, from + k, j), p.at)));
}
