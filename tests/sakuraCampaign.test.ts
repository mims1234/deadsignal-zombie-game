/**
 * KAIKA, the Sakura District's campaign (`sakura/campaign.ts`): its chapters follow the shared quest and contracts in
 * order, the co-op simulation marks the checkpoint and stages each chapter's set piece, and the helicopter waits for
 * the bloom. The field file covers every kind and every place.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, FIELD, PLACE_RADIO, chapterIndex, placeAt } from '../src/sakura/campaign';
import { LINE } from '../src/sakura/lines';
import { STORIES, storiesOpen } from '../src/sakura/missions';
import { FUSE_BIT, FUSES_ALL, KEY_BIT, SakuraQuest, decodeQuest, type QuestView } from '../src/sakura/quest';
import { HIRASAKA_KINDS, MUJIN_KINDS, VARIANTS } from '../src/enemies/variants';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { missionClock } from '../src/logic/mission';

const state = (q: Partial<QuestView>, more: Partial<{ defense: string; hunt: string; extracted: boolean }> = {}) => ({
  quest: { ...SakuraQuest.empty(), ...q },
  defense: 'active',
  hunt: 'active',
  extracted: false,
  ...more,
});

describe('KAIKA', { timeout: 30000 }, () => {
  it('is the one story, open from the start', () => {
    expect(storiesOpen()).toEqual(['kaika']);
    expect(STORIES.kaika.campaign).toBe(true);
  });

  it('moves through its chapters in order, on the shared state', () => {
    const P = FUSES_ALL; // the metro's power back
    expect(chapterIndex(state({}))).toBe(0); // LIGHTS OUT
    expect(chapterIndex(state({ marks: FUSE_BIT }))).toBe(0); // one fuse is not the power
    expect(chapterIndex(state({ marks: P }))).toBe(1);
    expect(chapterIndex(state({ found: 0b1, marks: P }))).toBe(2);
    expect(chapterIndex(state({ found: 0b1111, marks: P }))).toBe(5); // the lab keycard next
    expect(CHAPTERS[5]!.id).toBe('key');
    expect(chapterIndex(state({ found: 0b1111, marks: P | KEY_BIT }))).toBe(6); // the lab
    // the lanterns and the bell before the Empress (the relics are for her), the relay and home after
    expect(chapterIndex(state({ found: 0b11111, tied: 0b11111, phase: 'lanterns', marks: P | 1 }))).toBe(8); // the lanterns
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'lanterns', marks: P | 1 }, { hunt: 'complete' }))).toBe(8); // the Empress early changes nothing
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'bell', lit: 5, marks: P | 1 }))).toBe(9); // the bell
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'bloom', lit: 5, marks: P | 1 }))).toBe(10); // the Empress
    expect(CHAPTERS[10]!.id).toBe('curtain');
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'bloom', lit: 5, marks: P | 1 }, { hunt: 'complete' }))).toBe(11); // the relay, if it was never restored
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'bloom', lit: 5, marks: P | 1 }, { hunt: 'complete', defense: 'complete' }))).toBe(12);
    expect(chapterIndex(state({ found: 31, tied: 31, phase: 'bloom', lit: 5, marks: P | 1 }, { hunt: 'complete', defense: 'complete', extracted: true }))).toBe(CHAPTERS.length);
  });

  it('has a field file for every kind and a transmission for every place', () => {
    // MUJIN's kinds are the station's and HIRASAKA's the island's, not the field file's
    for (const v of VARIANTS) if (v && !(MUJIN_KINDS as readonly string[]).includes(v) && !(HIRASAKA_KINDS as readonly string[]).includes(v)) expect(FIELD[v as keyof typeof FIELD].does.length).toBeGreaterThan(20);
    for (const lines of Object.values(PLACE_RADIO)) expect(lines.length).toBeGreaterThan(0);
    // every line a chapter, a place or a first sight says is a voiced line
    const ids = [...CHAPTERS.flatMap((c) => c.intro), ...Object.values(PLACE_RADIO).flat(), ...Object.values(FIELD).map((f) => f.quip)];
    for (const id of ids) expect(LINE[id], id).toBeDefined();
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
    // the metro's fuses: taken from beside their cabinets, never from across the station
    const fz = q.spots.fuses;
    expect(q.takeFuse(0, fz[1]!.x, 0, fz[1]!.z)).toBe(false);
    for (let i = 0; i < 3; i++) expect(q.takeFuse(i, fz[i]!.x, 0, fz[i]!.z)).toBe(true);
    expect(SakuraQuest.powered(q.view)).toBe(true);
    // the lab's stairs are sealed until someone takes the keycard from the yard office (from beside it, not from afar)
    const lab = sim.level.sakura!.theatre.labLink;
    expect(lab.closed).toBe(true);
    const k = q.spots.key;
    sim.message('p1', { k: 'sq', a: 'key', i: 0 }, false);
    expect(SakuraQuest.hasKey(q.view)).toBe(false);
    stand(k.x, k.z);
    sim.tick(1 / 30);
    sim.message('p1', { k: 'sq', a: 'key', i: 0 }, false);
    expect(SakuraQuest.hasKey(q.view)).toBe(true);
    sim.tick(1 / 30);
    expect(lab.closed).toBe(false);
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

  it('reports the quest on its own key, beside the squad rows (a client reads `sq` as the squad)', () => {
    let snap: Record<string, unknown> | null = null;
    const sim = new SessionSim({ seed: 7, kind: 'kaika', map: 'sakura', send: (_to, d) => { if (d.k === 's') snap = d; } });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const st = sim.level.data.playerStart;
    sim.message('p1', { k: 'p', x: st.x, y: 0, z: st.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    for (let i = 0; i < 30; i++) sim.tick(1 / 30);
    const s = snap as unknown as { sq: unknown[]; lq: unknown };
    expect(s.sq.every((r) => Array.isArray(r))).toBe(true);
    expect(decodeQuest(s.lq)?.phase).toBe('charms');
  });

  it('still blooms when the relay was finished before the lanterns (no locked helicopter)', () => {
    const sim = new SessionSim({ seed: 6, kind: 'kaika', map: 'sakura', send() {} });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const q = (sim as unknown as { sakura: SakuraQuest }).sakura;
    const b = q.spots.bell;
    sim.message('p1', { k: 'p', x: b.x, y: 0, z: b.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    sim.tick(1 / 30);
    sim.debug.defense.status = 'complete';
    q.view.phase = 'bell';
    q.view.lit = 5;
    sim.message('p1', { k: 'sq', a: 'ring', i: 0 }, false);
    expect(q.view.phase).toBe('bloom');
  });
});

describe('the Sakura District clock', () => {
  it('gives the operation more time than the standard maps, and KAIKA far more', () => {
    const op = missionClock('sakura', 'mission');
    const kaika = missionClock('sakura', 'kaika');
    expect(op.deadline).toBeGreaterThan(missionClock('district').deadline);
    expect(kaika.deadline).toBeGreaterThanOrEqual(op.deadline * 2);
    expect(missionClock('sakura', 'roam')).toBe(op);
    const sim = new SessionSim({ seed: 2, kind: 'kaika', map: 'sakura', send() {} });
    expect((sim as unknown as { clock: { deadline: number } }).clock.deadline).toBe(kaika.deadline);
  });

  it('will not start the relay without the metro\'s power (it feeds from the station substation)', () => {
    const sim = new SessionSim({ seed: 8, kind: 'mission', map: 'sakura', send() {} });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const q = (sim as unknown as { sakura: SakuraQuest }).sakura;
    const c = sim.level.transmitter.console;
    const stand = (): void => sim.message('p1', { k: 'p', x: c.x, y: 0, z: c.z + 1, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    stand();
    sim.tick(1 / 30);
    const d = sim.debug;
    d.defense.status = 'available';
    sim.message('p1', { k: 'relay' }, false);
    expect(d.defense.status).toBe('available');
    const fz = q.spots.fuses;
    for (let i = 0; i < 3; i++) q.takeFuse(i, fz[i]!.x, fz[i]!.y - 1.4 > 0.5 ? fz[i]!.y - 1.4 : 0, fz[i]!.z);
    expect(SakuraQuest.powered(q.view)).toBe(true);
    stand();
    sim.message('p1', { k: 'relay' }, false);
    expect(d.defense.status).toBe('active');
  });
});
