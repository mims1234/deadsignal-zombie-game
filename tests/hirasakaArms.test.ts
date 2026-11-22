// HIRASAKA's arms (`src/hirasaka/armsPlaces.ts`, `logic/hirasakaGuns.ts`, the story's parts and benches): every part
// and bench can be walked to, the recipes build only with their parts at their bench, the built guns out-damage
// everything the box or a wall sells.
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { ARMS_PARTS, armsSpots, BENCH, recipeMask, shrineOpen } from '../src/hirasaka/armsPlaces';
import { allSpots, CAGE, HEIGHTS, inDeep, OBSTACLES, TOOL_IDS, TOOLS, type Spot } from '../src/hirasaka/places';
import { BUILT, decodeStory, encodeStory, HirasakaStory, LADLE } from '../src/hirasaka/story';
import { applyHirasakaDoors } from '../src/hirasaka/doors';
import { SessionSim } from '../src/sim/serverHost';
import { FlowField } from '../src/world/nav';
import { MELEE } from '../src/logic/melee';
import { WEAPONS } from '../src/config';
import { dpsOf, HIRASAKA_GUN_IDS } from '../src/logic/hirasakaGuns';

const gunDps = (id: keyof typeof WEAPONS, n: number): number => dpsOf(WEAPONS[id], n);

const at = (s: Spot): Spot => ({ x: s.x, y: s.y, z: s.z });

describe('HIRASAKA arms: the places', () => {
  const sim = new SessionSim({ map: 'hirasaka', send: () => {} });
  const level = sim.level;
  const h = level.hirasaka!;
  const open = HirasakaStory.empty();
  open.obstacles = (1 << OBSTACLES.length) - 1;
  open.ladles = LADLE.given;
  applyHirasakaDoors(level, open);
  const st = level.data.playerStart;
  const field = new FlowField(level.nav);
  field.compute(st.x, st.z);
  const deepField = new FlowField(level.floors.navOf(h.mineArea));
  deepField.compute(CAGE.bottomOut.x, CAGE.bottomOut.z);
  const highField = new FlowField(level.floors.navOf(h.heightsArea));
  highField.compute(HEIGHTS.stairHead.x, HEIGHTS.stairHead.z - 1.6);
  const fieldFor = (s: Spot): FlowField => (inDeep(s.x) ? deepField : s.y > HEIGHTS.y - 1 ? highField : field);

  it('every part, bench, board, shrine stop and cage stop stands on its floor and can be walked to', () => {
    const wrong: string[] = [];
    for (const { id, at: s } of armsSpots()) {
      const fy = level.world.floorBelow(s.x, s.z, 0.3, s.y + 0.4, 0.8);
      if (Math.abs(fy - s.y) > 0.35) wrong.push(`${id}: floor ${fy.toFixed(2)} not ${s.y}`);
      const f = fieldFor(s);
      let ok = false;
      for (let a = 0; a < 16 && !ok; a++) for (const r of [0, 1, 2]) if (f.isReachable(s.x + Math.cos(a * 0.39) * r, s.z + Math.sin(a * 0.39) * r)) ok = true;
      if (!ok) wrong.push(`${id}: unreachable`);
    }
    expect(wrong).toEqual([]);
  });

  it('the parts lie clear of every other thing to take (3 m), so each prompt is its own', () => {
    const others = allSpots().filter((s) => !s.id.startsWith('ob:'));
    const wrong: string[] = [];
    for (const p of ARMS_PARTS)
      for (const o of others) if (Math.hypot(p.at.x - o.at.x, p.at.z - o.at.z) < 3 && Math.abs(p.at.y - o.at.y) < 2) wrong.push(`${p.id} / ${o.id}`);
    expect(wrong).toEqual([]);
  });
});

describe('HIRASAKA arms: the story keeps the parts and builds at the benches', () => {
  it('a part is taken where it lies, once; a gun is built only with all its parts, at its bench', () => {
    const q = new HirasakaStory();
    const happa = ARMS_PARTS.map((p, i) => ({ p, i })).filter(({ p }) => p.recipe === 'happa');
    expect(q.act('apart', happa[0]!.i, { x: 0, y: 0, z: 0 })).toBe(false);
    for (const { p, i } of happa.slice(0, 2)) expect(q.act('apart', i, at(p.at))).toBe(true);
    expect(q.act('apart', happa[0]!.i, at(happa[0]!.p.at))).toBe(false);
    expect(q.act('built', BUILT.happa, at(BENCH.happa))).toBe(false); // a part short
    expect(q.act('apart', happa[2]!.i, at(happa[2]!.p.at))).toBe(true);
    expect(q.view.parts & recipeMask('happa')).toBe(recipeMask('happa'));
    expect(q.act('built', BUILT.happa, at(BENCH.sakuganki))).toBe(false); // the wrong bench
    expect(q.act('built', BUILT.happa, at(BENCH.happa))).toBe(true);
    expect(q.act('built', BUILT.happa, at(BENCH.happa))).toBe(false); // built once, for the squad
    expect(q.act('built', BUILT.sakuganki, at(BENCH.sakuganki))).toBe(false);
    // the wire carries the parts
    const back = decodeStory(encodeStory(q.view))!;
    expect(back.parts).toBe(q.view.parts);
    expect(back.built).toBe(q.view.built);
  });
  it('the village shrine takes the box only once the cage has gone down', () => {
    expect(shrineOpen(2, false)).toBe(false);
    expect(shrineOpen(2, true)).toBe(true);
    expect(shrineOpen(0, false)).toBe(true);
  });
});

describe('HIRASAKA arms: the weapons', () => {
  it('each tool is a weapon to swing; the tachi strikes behind on its heavy swing', () => {
    for (const id of ['tsuruhashi', 'timberAxe', 'coalShovel', 'tachi'] as const) expect(MELEE[id]).toBeTruthy();
    expect(MELEE.tachi.behind).toBe(true);
    expect(TOOL_IDS.length).toBe(4);
    for (const t of TOOL_IDS) expect(TOOLS[t]).toBeTruthy();
  });
  it('every built gun beats every box and wall gun (damage a second on one target, and on a crowd of six)', () => {
    const box = ['pistol', 'rifle', 'shotgun', 'rpg', 'arbalet', 'signalka'] as const;
    const best1 = Math.max(...box.map((id) => gunDps(id, 1)));
    const best6 = Math.max(...box.map((id) => gunDps(id, 6)));
    for (const id of HIRASAKA_GUN_IDS) {
      expect(WEAPONS[id].price).toBe(0);
      if (id === 'mori') continue; // the harpoon's job is the pin and the drag (and the umibōzu): checked on a crowd only
      expect(gunDps(id, 1), `${id} on one`).toBeGreaterThan(best1);
    }
    for (const id of HIRASAKA_GUN_IDS) expect(gunDps(id, 6), `${id} on six`).toBeGreaterThan(best6);
  });
});
