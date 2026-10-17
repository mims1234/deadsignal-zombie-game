/**
 * KAIKA, the Sakura District's campaign (`sakura/campaign.ts`): its chapters follow the shared quest and contracts in
 * order, the co-op simulation marks the checkpoint and stages each chapter's set piece, and the helicopter waits for
 * the bloom. The field file covers every kind and every place.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, CHECKPOINT, FIELD, MARK, PLACE_RADIO, chapterIndex, placeAt } from '../src/sakura/campaign';
import { STORIES, storiesOpen } from '../src/sakura/missions';
import { SakuraQuest, type QuestView } from '../src/sakura/quest';
import { VARIANTS } from '../src/enemies/variants';
import { LIFE, SessionSim } from '../src/sim/serverHost';

const state = (q: Partial<QuestView>, more: Partial<{ defense: string; hunt: string; extracted: boolean }> = {}) => ({
  quest: { ...SakuraQuest.empty(), ...q },
  defense: 'active',
  hunt: 'active',
  extracted: false,
  ...more,
});

describe('KAIKA', { timeout: 30000 }, () => {
  it('is open from the start; the other stories wait for the Thousand Lanterns', () => {
    expect(storiesOpen(false)).toEqual(['kaika']);
    expect(storiesOpen(true)).toEqual(['kaika', 'curtain', 'lasttrain', 'hanami']);
    expect(STORIES.kaika.settled).toBeUndefined();
  });

  it('moves through its chapters in order, on the shared state', () => {
    expect(chapterIndex(state({}))).toBe(0);
    expect(chapterIndex(state({ found: 0b1 }))).toBe(1);
    expect(chapterIndex(state({ found: 0b1111 }))).toBe(4); // the checkpoint next
    expect(chapterIndex(state({ found: 0b1111, marks: MARK.checkpoint }))).toBe(5);
    expect(chapterIndex(state({ found: 0b11111, tied: 0b11111, phase: 'lanterns', marks: 1 }))).toBe(7); // the Empress
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'lanterns', marks: 1 }, { hunt: 'complete' }))).toBe(8);
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'bell', lit: 5, marks: 1 }, { hunt: 'complete' }))).toBe(9);
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'bloom', lit: 5, marks: 1 }, { hunt: 'complete', defense: 'complete' }))).toBe(10);
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'bloom', lit: 5, marks: 1 }, { hunt: 'complete', defense: 'complete', extracted: true }))).toBe(CHAPTERS.length);
  });

  it('has a field file for every kind and a transmission for every place', () => {
    for (const v of VARIANTS) if (v) expect(FIELD[v].does.length).toBeGreaterThan(20);
    for (const lines of Object.values(PLACE_RADIO)) expect(lines.length).toBeGreaterThan(0);
    expect(placeAt(-100, 30, false, false, false)).toBe('station');
    expect(placeAt(100, 50, false, false, false)).toBe('shrine');
    expect(placeAt(20, -44, false, false, false)).toBe('theatre');
    expect(placeAt(0, 0, true, false, false)).toBe('metro');
  });

  it('runs in the co-op simulation: the set piece, the checkpoint, the helicopter held for the bloom', () => {
    const sim = new SessionSim({ seed: 5, kind: 'kaika', map: 'sakura', send() {} });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const st = sim.level.data.playerStart;
    expect([st.x, st.z]).toEqual([-104, 30]); // the operation's own start
    const stand = (x: number, z: number): void => sim.message('p1', { k: 'p', x, y: 0, z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    stand(st.x, st.z);
    sim.tick(1 / 30);
    // chapter one's commuters wait round the metro's lost and found
    const q = (sim as unknown as { sakura: SakuraQuest }).sakura;
    const c0 = q.spots.charms[0]!;
    const near = sim.zombies.zombies.filter((z) => z.variant === 'commuter' && Math.hypot(z.x - c0.x, z.z - c0.z) < 12);
    expect(near.length).toBeGreaterThanOrEqual(2);
    // someone at the freight yard's list board marks the checkpoint
    stand(CHECKPOINT.x, CHECKPOINT.z);
    sim.tick(1 / 30);
    expect(q.view.marks & MARK.checkpoint).toBe(MARK.checkpoint);
    // both contracts done: still no helicopter until the bloom
    const d = sim.debug;
    d.defense.status = 'complete';
    d.hunt.status = 'complete';
    stand(st.x, st.z);
    for (let i = 0; i < 5; i++) sim.tick(1 / 30);
    expect(d.extraction.phase).toBe('locked');
    q.view.phase = 'bloom';
    sim.tick(1 / 30);
    expect(d.extraction.phase).toBe('available');
  });
});
