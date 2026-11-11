/**
 * ZARYA: the Zenit's photographs (`src/zarya/photos.ts`, the `zenit` clues of `story.ts`) and Morozko's question,
 * parry and weak points (`director.ts`, `PARRY`). The rules on their own, then the parry as the co-op simulation runs
 * it (the real director against the real zombie manager on the real map, the request on the existing wire).
 */
import '../src/sim/stubs';
import { describe, expect, it, vi } from 'vitest';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { PARRY, WEAK_SIDE, sideHit, weakAt, type ZaryaDirector } from '../src/zarya/director';
import { LINES } from '../src/zarya/lines';
import { PHOTO_CLUES, SHOTS, captionOf, filmLook } from '../src/zarya/photos';
import { BERLOGA, ZARYA } from '../src/zarya/places';
import { CH, CLUE, CLUES, G, LOOKED, STORY, ZaryaStory, decodeStory, encodeStory, type StoryView } from '../src/zarya/story';

vi.setConfig({ testTimeout: 120_000 });

const view = (patch: Partial<StoryView>): StoryView => ({ ...ZaryaStory.empty(), ...patch });
/** The squad past the Tamada, every zone with a marked spot open. */
const OPEN = G.tickets | G.escalator | G.tamada | G.tamadaDown | G.pond | G.code;

describe('the marked spots', () => {
  it('six photographs, each a clue with a shot, a caption on the wire and a spot inside its own zone', () => {
    expect(PHOTO_CLUES.length).toBe(6);
    for (const i of PHOTO_CLUES) {
      const c = CLUES[i]!;
      expect(c.zenit).toBe(true);
      expect(SHOTS[c.id]?.id).toBe(c.id);
      expect(c.id in LINES).toBe(true);
      expect(captionOf(c.id).text.length).toBeGreaterThan(20);
      expect(ZaryaStory.zoneOf(c.at.x, c.at.z)).toBe(c.zone);
      // the camera stands in the same zone, and looks at the spot's side of things
      const s = SHOTS[c.id]!;
      expect(ZaryaStory.zoneOf(s.eye[0], s.eye[2])).toBe(c.zone);
      expect(s.figures.length).toBeGreaterThan(0);
    }
    // the clues that are looked at are the rest
    for (let i = 0; i < CLUES.length; i++) expect((LOOKED & (1 << i)) !== 0).toBe(!CLUES[i]!.zenit);
  });

  it('a photograph is taken with the Zenit from within ten metres, once the Tamada is down and the zone is open', () => {
    const i = CLUE.stillTets;
    const at = CLUES[i]!.at;
    expect(ZaryaStory.can(view({ ch: CH.act2, g: OPEN & ~G.tamadaDown }), 'photo', i)).toBe(false);
    expect(ZaryaStory.can(view({ ch: CH.act2, g: OPEN & ~G.pond }), 'photo', i)).toBe(false);
    expect(ZaryaStory.can(view({ ch: CH.act2, g: OPEN }), 'photo', i)).toBe(true);
    // never looked at: a photograph is no prompt
    expect(ZaryaStory.can(view({ ch: CH.act2, g: OPEN }), 'clue', i)).toBe(false);

    const s = new ZaryaStory();
    Object.assign(s as unknown as Record<string, number>, { ch: CH.act2, g: OPEN });
    expect(s.act('photo', i, { x: at.x + STORY.zenit + 1, z: at.z })).toBe(false);
    expect(s.act('photo', i, { x: at.x + STORY.zenit - 1, z: at.z })).toBe(true);
    expect(ZaryaStory.can(s.view, 'photo', i)).toBe(false);
    expect(s.drain()).toContainEqual({ kind: 'clue', i });
    // on the wire like any clue
    expect(decodeStory(encodeStory(s.view))!.clues & (1 << i)).not.toBe(0);
    // a looked-at clue cannot be had by flashing at it
    expect(s.act('photo', CLUE.pipe, CLUES[CLUE.pipe]!.at)).toBe(false);
  });

  it('the print: the frame the right way up, graded the same every time, opaque', () => {
    const w = 8;
    const h = 4;
    const src = new Uint8Array(w * h * 4);
    // the bottom row (first in a GPU read-back) white, the rest black
    for (let x = 0; x < w; x++) src.set([255, 255, 255, 255], x * 4);
    const a = filmLook(src, w, h, 3);
    const b = filmLook(src, w, h, 3);
    expect([...a]).toEqual([...b]);
    const lum = (y: number): number => {
      let n = 0;
      for (let x = 0; x < w; x++) n += a[(y * w + x) * 4]!;
      return n / w;
    };
    expect(lum(h - 1)).toBeGreaterThan(lum(0) + 60);
    for (let k = 3; k < a.length; k += 4) expect(a[k]).toBe(255);
  });
});

describe('the weak points', () => {
  it('a blow lands on the side of him it comes from', () => {
    // he faces north (yaw 0, toward -z); a blow travelling the other way hits his front
    expect(sideHit(0, Math.PI)).toBe(0);
    expect(sideHit(0, 0)).toBe(1);
    // travelling east (yaw -pi/2: toward +x) it came from the west: his left
    expect(sideHit(0, -Math.PI / 2)).toBe(2);
    expect(sideHit(0, Math.PI / 2)).toBe(3);
    expect(weakAt(0b11111, 0)).toBe(0);
    expect(weakAt(0b11110, 0)).toBe(4);
    expect(weakAt(0b00110, 0)).toBe(-1);
    expect(WEAK_SIDE.length).toBe(PARRY.weakMax);
  });
});

describe("Morozko's question, in the co-op simulation", () => {
  const sim = new SessionSim({ seed: 11, kind: 'mission', map: 'zarya', send: () => {} });

  function fight(clues: number) {
    sim.players([{ id: 'p1', name: 'Mira' }]);
    sim.begin();
    const story = sim.zarya!;
    const dir = (sim as unknown as { zaryaDir: ZaryaDirector }).zaryaDir;
    const me: { x: number; z: number } = { x: ZARYA.start.x, z: ZARYA.start.z };
    const run = (seconds = 0): void => {
      for (let i = 0, n = Math.max(1, Math.round(seconds * 30)); i < n; i++) {
        if (i % 3 === 0) sim.message('p1', { k: 'p', x: me.x, y: 0, z: me.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
        sim.tick(1 / 30);
      }
    };
    Object.assign(story as unknown as Record<string, number>, { ch: CH.finale, g: OPEN | G.keyDoor, clues });
    run();
    const m = dir.where('morozko')!;
    me.x = BERLOGA.askLine + 2;
    me.z = 0;
    run(1);
    expect(ZaryaStory.did(story.view, G.asked)).toBe(true);
    // right up to him: the fight starts
    me.x = m.x - 2;
    me.z = m.z;
    run(0.5);
    expect(m.chasing || m.state === 'attack').toBe(true);
    /** Until he winds up his heavy blow (his question); false if he never does. */
    const untilAsked = (secs = 20): boolean => {
      for (let t = 0; t < secs * 30; t++) {
        me.x = m.x - Math.sin(m.yaw) * 2;
        me.z = m.z - Math.cos(m.yaw) * 2;
        run();
        if (m.windingUp && m.poseMode === 'slam') return true;
      }
      return false;
    };
    const ask = (): void => sim.message('p1', { k: 'zy', a: 'parry', i: 0, h: false }, false);
    return { story, dir, m, me, run, untilAsked, ask };
  }

  it('asks before each heavy blow, and a parry asked for in the pause staggers him and opens a weak point per clue', () => {
    // three looked at, two photographs: five
    const t = fight(0b111 | (1 << CLUE.stillDk) | (1 << CLUE.stillClock));
    // a parry asked for while he is not asking does nothing
    if (!(t.m.windingUp && t.m.poseMode === 'slam')) {
      t.ask();
      t.run();
      expect(t.dir.morozko.parries).toBe(0);
    }
    expect(t.untilAsked()).toBe(true);
    t.ask();
    t.run();
    expect(t.dir.morozko.parries).toBe(1);
    expect(t.m.state).toBe('stagger');
    expect(t.dir.morozko.weak).toBe(0b11111);
    // a blow from the front on an open one: three times over, and it closes
    const hp = t.m.hp;
    sim.message('p1', { k: 'hit', z: t.m.id, a: 100, h: false, y: t.m.yaw + Math.PI }, false);
    expect(hp - t.m.hp).toBeCloseTo(100 * PARRY.weakMul, 3);
    expect(t.dir.morozko.weak).toBe(0b11110);
    // he reels for the whole of it, then the rest close
    t.run(PARRY.stagger - 0.4);
    expect(t.m.state).toBe('stagger');
    expect(t.dir.morozko.weak).not.toBe(0);
    t.run(0.8);
    expect(t.dir.morozko.weak).toBe(0);
    expect(t.m.state).not.toBe('stagger');
    // and the next heavy blow comes with the question again
    expect(t.untilAsked()).toBe(true);
  });

  it('a blow landing in the pause that throws him back is a parry too; with no clues it opens nothing', () => {
    const t = fight(0);
    expect(t.untilAsked()).toBe(true);
    // what a swung weapon does to one winding up (`meleeSystem`): the stagger, and the blow
    t.m.stagger(1.1);
    sim.message('p1', { k: 'hit', z: t.m.id, a: 50, h: false, y: 0 }, false);
    t.run();
    expect(t.dir.morozko.parries).toBe(1);
    expect(t.dir.morozko.reel).toBeGreaterThan(PARRY.stagger - 0.2);
    expect(t.dir.morozko.weak).toBe(0);
  });

  it('his health is scaled only by the clues that were looked at', () => {
    const a = fight(0b111);
    const full = a.m.maxHp;
    Object.assign(a.story as unknown as Record<string, number>, { clues: 0b111 | (1 << CLUE.stillSquare) | (1 << CLUE.stillTets) });
    a.run();
    expect(a.m.maxHp).toBeCloseTo(full, 3);
  });
});

