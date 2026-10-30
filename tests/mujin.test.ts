/**
 * MUJIN, the unmanned station: the loop's rules (`mujin/loop.ts`), the night taking areas without cutting the station
 * apart (`mujin/director.ts`), Ren's way home, and a co-op simulation running the station end to end.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { ANOMALIES } from '../src/mujin/anomalies';
import { MujinSeals } from '../src/mujin/director';
import { LINES } from '../src/mujin/lines';
import { decodeLoop, encodeLoop, MujinLoop, MUJIN_LOOP, NONE, READ, REN, REN_STATE } from '../src/mujin/loop';
import { MUJIN, SEALS, SPOTS, SPOT_INDEX, sealedAt } from '../src/mujin/places';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { FlowField } from '../src/world/nav';
import { existsSync } from 'node:fs';

/** Run the loop to the moment it can be read. */
function toRead(q: MujinLoop): void {
  while (!MujinLoop.canRead(q.view)) q.tick(0.5);
}
/** Run the loop through to the next loop (or the dawn). */
function toNext(q: MujinLoop): void {
  const n = q.view.loop;
  for (let i = 0; i < 1000 && q.view.loop === n && q.view.phase !== 'dawn'; i++) q.tick(0.5);
}
/** Read the loop right, wherever its change is. */
function readRight(q: MujinLoop): void {
  toRead(q);
  const s = MujinLoop.changeSpot(q.view);
  if (s < 0) expect(q.allClear(MUJIN.bell.x, MUJIN.bell.z)).toBe(true);
  else expect(q.report(s, SPOTS[s]!.x, SPOTS[s]!.z)).toBe(true);
}

describe('MUJIN: the loop', () => {
  it('starts with nothing wrong, and the All Clear is a right read', () => {
    const q = new MujinLoop();
    q.reset(() => 0.5);
    expect(q.view.anomaly).toBe(NONE);
    expect(q.allClear(MUJIN.bell.x, MUJIN.bell.z)).toBe(false); // too soon: nobody reads the station blind
    toRead(q);
    expect(q.allClear(MUJIN.bell.x, MUJIN.bell.z)).toBe(true);
    expect(q.view.read).toBe(READ.clear);
    toNext(q);
    expect(q.view.lamps).toBe(1);
    expect(q.view.sealed).toBe(0);
  });

  it('a read is final, and only counts close to where it is made', () => {
    const q = new MujinLoop();
    q.reset(() => 0.5);
    toRead(q);
    expect(q.report(SPOT_INDEX.clock, 40, 30)).toBe(false);
    expect(q.report(SPOT_INDEX.clock, SPOTS[SPOT_INDEX.clock].x, SPOTS[SPOT_INDEX.clock].z)).toBe(true);
    expect(q.allClear(MUJIN.bell.x, MUJIN.bell.z)).toBe(false);
    expect(q.view.read).toBe(READ.wrong); // nothing was wrong in loop 1
  });

  it('a wrong read puts out every lamp and the night takes the next area; three in a row take the station', () => {
    const q = new MujinLoop();
    let r = 0;
    q.reset(() => ((r = (r * 9301 + 49297) % 233280), r / 233280));
    readRight(q);
    toNext(q);
    readRight(q);
    toNext(q);
    expect(q.view.lamps).toBe(2);
    // nobody reads: wrong
    toNext(q);
    expect(q.view.lamps).toBe(0);
    expect(q.view.sealed).toBe(1);
    toNext(q);
    expect(q.view.sealed).toBe(3);
    const e = q.drain();
    toNext(q);
    expect(q.view.phase).toBe('dawn');
    expect(q.view.dawn).toBe(false);
    expect([...e, ...q.drain()].some((x) => x.kind === 'night')).toBe(true);
  });

  it('five right in a row bring the dawn; every change comes once and from its own loop on', () => {
    const q = new MujinLoop();
    let r = 7;
    q.reset(() => ((r = (r * 9301 + 49297) % 233280), r / 233280));
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      if (q.view.anomaly >= 0) {
        seen.push(q.view.anomaly);
        expect(ANOMALIES[q.view.anomaly]!.tier).toBeLessThanOrEqual(q.view.loop >= 6 ? 5 : Math.max(1, q.view.loop));
      }
      readRight(q);
      toNext(q);
    }
    expect(q.view.dawn).toBe(true);
    expect(q.view.phase).toBe('dawn');
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('the payphone rings once a loop; the fifth call is Ren, and she can be brought to the bench', () => {
    const q = new MujinLoop();
    q.reset(() => 0.99); // never "nothing wrong"... except by the rules
    for (let n = 1; n <= MUJIN_LOOP.calls; n++) {
      while (!MujinLoop.phoneRinging(q.view)) q.tick(0.5);
      expect(q.answer(MUJIN.payphone.x, MUJIN.payphone.z)).toBe(true);
      expect(q.answer(MUJIN.payphone.x, MUJIN.payphone.z)).toBe(false);
      if (n === MUJIN_LOOP.calls) break;
      readRight(q);
      toNext(q);
    }
    expect(q.view.lamps).toBe(4);
    expect(q.view.ren).toBe(REN_STATE.here);
    expect(q.view.anomaly).toBe(REN);
    // take her hand, walk her to the bench
    expect(q.takeRen(0, q.view.renX, q.view.renZ)).toBe(true);
    for (let i = 0; i < 40; i++) q.stepRen(0.1, { x: MUJIN.bench.x, z: MUJIN.bench.z + 1, yaw: 0 });
    expect(q.seatRen(0, MUJIN.bench.x, MUJIN.bench.z)).toBe(true);
    expect(q.view.ren).toBe(REN_STATE.safe);
    expect(q.view.read).toBe(READ.wrong);
    toNext(q);
    expect(q.view.lamps).toBe(0);
    expect(q.view.ren).toBe(REN_STATE.safe);
  });

  it('goes over the wire and back unchanged', () => {
    const q = new MujinLoop();
    q.reset(() => 0.3);
    toRead(q);
    const back = decodeLoop(JSON.parse(JSON.stringify(encodeLoop(q.view))));
    expect(back).toEqual({ ...q.view, t: Math.round(q.view.t * 10) / 10 });
  });

  it('has a voice file for every line and a spot for every change', () => {
    for (const l of LINES) expect(existsSync(`public/mujin/voice/${l.id}.mp3`), l.id).toBe(true);
    for (const a of ANOMALIES) expect(SPOT_INDEX[a.spot]).toBeGreaterThanOrEqual(0);
  });
});

describe('MUJIN: the station', () => {
  it('the night can take every area and the station stays in one piece', () => {
    const sim = new SessionSim({ seed: 5, kind: 'mission', map: 'mujin', send() {} });
    const { world, nav } = sim.level;
    const seals = new MujinSeals(world, nav, sim.level.mujin!.seals);
    for (let bits = 0; bits < 1 << SEALS.length; bits++) {
      seals.sync(bits);
      const f = new FlowField(nav);
      f.compute(MUJIN.start.x, MUJIN.start.z);
      for (const s of SPOTS) {
        if (s.id === 'bridge' || s.id === 'speaker' || s.id === 'clock' || s.id === 'sign' || s.id === 'tunnel') continue; // up high, or behind a wall
        if (sealedAt(bits, s.x, s.z)) continue;
        expect(f.isReachable(s.x, s.z), `${s.id} with ${bits}`).toBe(true);
      }
      expect(f.isReachable(MUJIN.bell.x, MUJIN.bell.z + 1)).toBe(true);
      for (let i = 0; i < SEALS.length; i++) {
        const r = SEALS[i]!.rect;
        const inside = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 + (i === 0 ? 3 : 0) };
        if (bits & (1 << i)) expect(f.isReachable(inside.x, inside.z), `${SEALS[i]!.id} sealed`).toBe(false);
      }
    }
  });

  it('a co-op night runs: the loop goes round, the station is put back, the Stationmaster waits his turn', () => {
    const sent: Record<string, unknown>[] = [];
    const sim = new SessionSim({ seed: 9, kind: 'mission', map: 'mujin', send: (_to, d) => sent.push(d) });
    sim.players([{ id: 'a', name: 'A' }]);
    sim.begin();
    sim.message('a', { k: 'p', x: MUJIN.start.x, y: 0.3, z: MUJIN.start.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, true);
    expect(sim.zombies.boss).toBeNull();
    for (let i = 0; i < 30 * 12; i++) {
      sim.message('a', { k: 'p', x: MUJIN.bell.x, y: 0.3, z: MUJIN.bell.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, true);
      sim.tick(1 / 30);
    }
    sim.message('a', { k: 'mj', a: 'clear' }, true);
    expect(sim.mujin!.view.read).toBe(READ.clear);
    for (let i = 0; i < 30 * 120; i++) {
      sim.message('a', { k: 'p', x: MUJIN.bell.x, y: 0.3, z: MUJIN.bell.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, true);
      sim.tick(1 / 30);
      if (sim.mujin!.view.loop > 1) break;
    }
    expect(sim.mujin!.view.loop).toBe(2);
    expect(sim.mujin!.view.lamps).toBe(1);
    expect(sent.some((d) => Array.isArray((d as { mj?: unknown }).mj))).toBe(true);
    expect(sim.zombies.boss).toBeNull();
  });
});
