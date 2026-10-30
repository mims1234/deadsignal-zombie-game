/**
 * MUJIN, "The Last Service": the five jobs (`mujin/jobs.ts`), the night taking the station when nothing gets done, Ren's
 * way home, the station's voices on disk, and a co-op simulation running a job end to end.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { LINES } from '../src/mujin/lines';
import { MUJIN_CAST } from '../src/anime/cast';
import { ANIME_CAST } from '../src/config';
import { MUJIN_KINDS } from '../src/enemies/variants';
import { decodeJobs, encodeJobs, MujinJobs, MUJIN_JOBS, REN_STATE } from '../src/mujin/jobs';
import { MUJIN, PLACES, SEALS } from '../src/mujin/places';
import { LIFE, SessionSim } from '../src/sim/serverHost';

const at = (o: { x: number; z: number }): [number, number] => [o.x, o.z];
const stand = (o: { x: number; z: number }) => [{ x: o.x, z: o.z, up: true }];

/** Every job done, the honest way. */
function doAll(q: MujinJobs): void {
  expect(q.takeKey(...at(PLACES.key))).toBe(true);
  expect(q.windClock(...at(PLACES.clock))).toBe(true);
  PLACES.breakers.forEach((b, i) => expect(q.throwBreaker(i, b.x, b.z)).toBe(true));
  for (let t = 0; t < MUJIN_JOBS.charge + 1; t += 0.5) q.tick(0.5, stand(PLACES.crossing));
  PLACES.tickets.forEach((t, i) => {
    if (q.view.ticketSet & (1 << i)) expect(q.takeTicket(i, t.x, t.z)).toBe(true);
  });
  expect(q.returnTickets(...at(PLACES.gates))).toBe(true);
  expect(q.tieRope(...at(PLACES.rope))).toBe(true);
  expect(q.startAnnouncement(...at(PLACES.mic))).toBe(true);
  for (let t = 0; t < MUJIN_JOBS.announce + 1; t += 0.5) q.tick(0.5, stand(PLACES.hall));
}

describe('MUJIN: the jobs', () => {
  it('each job lights a lamp; all five bring the dawn', () => {
    const q = new MujinJobs();
    q.reset(() => 0.4);
    expect(MujinJobs.lamps(q.view)).toBe(0);
    doAll(q);
    expect(MujinJobs.lamps(q.view)).toBe(5);
    expect(q.view.dawn).toBe(true);
    const kinds = q.drain().map((e) => e.kind);
    expect(kinds.filter((k) => k === 'done').length).toBe(5);
    expect(kinds).toContain('dawn');
  });

  it('every step checks where you are, and the steps come in order', () => {
    const q = new MujinJobs();
    q.reset(() => 0.4);
    expect(q.windClock(...at(PLACES.clock))).toBe(false); // no key yet
    expect(q.takeKey(0, 0)).toBe(false); // too far
    expect(q.takeKey(...at(PLACES.key))).toBe(true);
    expect(q.takeKey(...at(PLACES.key))).toBe(false); // once
    expect(q.returnTickets(...at(PLACES.gates))).toBe(false); // none carried
    expect(q.tieRope(0, 0)).toBe(false);
    // the crossing only charges with someone on the road, after all three breakers
    q.tick(5, stand(PLACES.crossing));
    expect(q.view.charge).toBe(0);
    PLACES.breakers.forEach((b, i) => q.throwBreaker(i, b.x, b.z));
    q.tick(5, stand({ x: 0, z: 0 }));
    expect(q.view.charge).toBe(0);
    q.tick(5, stand(PLACES.crossing));
    expect(q.view.charge).toBeGreaterThan(0);
  });

  it('five of the eight ticket spots get a ticket', () => {
    const q = new MujinJobs();
    q.reset(() => 0.7);
    let n = 0;
    for (let i = 0; i < PLACES.tickets.length; i++) if (q.view.ticketSet & (1 << i)) n++;
    expect(n).toBe(MUJIN_JOBS.tickets);
  });

  it('with nothing done the night takes the street, the shrine, the field, then the station; a job winds it back', () => {
    const q = new MujinJobs();
    q.reset(() => 0.4);
    q.tick(MUJIN_JOBS.nightEvery - 30, []);
    expect(q.view.sealed).toBe(0);
    q.takeKey(...at(PLACES.key));
    q.windClock(...at(PLACES.clock));
    expect(q.view.night).toBe(MUJIN_JOBS.nightEvery);
    for (let i = 0; i < SEALS.length; i++) {
      q.tick(MUJIN_JOBS.nightEvery + 0.1, []);
      expect(q.view.sealed).toBe((1 << (i + 1)) - 1);
    }
    expect(q.view.lost).toBe(false);
    q.tick(MUJIN_JOBS.nightEvery + 0.1, []);
    expect(q.view.lost).toBe(true);
    expect(q.drain().some((e) => e.kind === 'night')).toBe(true);
  });

  it('the payphone rings after each job; the fifth call brings Ren, who can be walked to the bench', () => {
    const q = new MujinJobs();
    q.reset(() => 0.4);
    expect(MujinJobs.phoneRinging(q.view)).toBe(false);
    doAll(q);
    for (let n = 1; n <= MUJIN_JOBS.calls; n++) {
      expect(MujinJobs.phoneRinging(q.view)).toBe(true);
      expect(q.answer(MUJIN.payphone.x, MUJIN.payphone.z)).toBe(true);
    }
    expect(MujinJobs.phoneRinging(q.view)).toBe(false);
    expect(q.view.ren).toBe(REN_STATE.here);
    expect(q.takeRen(0, q.view.renX, q.view.renZ)).toBe(true);
    for (let i = 0; i < 40; i++) q.stepRen(0.1, { x: MUJIN.bench.x, z: MUJIN.bench.z + 1, yaw: 0 });
    expect(q.seatRen(0, MUJIN.bench.x, MUJIN.bench.z)).toBe(true);
    expect(q.view.ren).toBe(REN_STATE.safe);
  });

  it('goes over the wire and back', () => {
    const q = new MujinJobs();
    q.reset(() => 0.3);
    q.takeKey(...at(PLACES.key));
    q.tick(12.34, []);
    const back = decodeJobs(JSON.parse(JSON.stringify(encodeJobs(q.view))));
    expect(back).toEqual({ ...q.view, night: Math.round(q.view.night * 10) / 10 });
  });

  it('loads every model the station wears before the run (nothing parsed in the middle of play)', () => {
    for (const k of MUJIN_KINDS) expect(MUJIN_CAST, k).toContain(ANIME_CAST.kinds[k]);
    for (const f of ANIME_CAST.horde) expect(MUJIN_CAST).toContain(f);
  });

  it('has a voice file for every line', () => {
    for (const l of LINES) expect(existsSync(`public/mujin/voice/${l.id}.mp3`), l.id).toBe(true);
  });
});

describe('MUJIN: co-op', () => {
  it('the simulation runs the jobs: the key brings the crawlers, the clock lights a lamp, the Stationmaster walks', () => {
    const sent: Record<string, unknown>[] = [];
    const sim = new SessionSim({ seed: 9, kind: 'mission', map: 'mujin', send: (_to, d) => sent.push(d) });
    sim.players([{ id: 'a', name: 'A' }]);
    sim.begin();
    const go = (o: { x: number; z: number }, secs: number): void => {
      for (let i = 0; i < secs * 30; i++) {
        sim.message('a', { k: 'p', x: o.x, y: 0.3, z: o.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, true);
        sim.tick(1 / 30);
      }
    };
    go(MUJIN.start, 1);
    expect(sim.zombies.boss).toBeNull();
    go(PLACES.key, 0.5);
    const before = sim.zombies.zombies.filter((z) => z.variant === 'crawler').length;
    sim.message('a', { k: 'mj', a: 'key' }, true);
    go(PLACES.key, 0.2);
    expect(sim.mujin!.view.key).toBe(1);
    expect(sim.zombies.zombies.filter((z) => z.variant === 'crawler').length).toBeGreaterThan(before);
    go(PLACES.clock, 0.5);
    sim.message('a', { k: 'mj', a: 'wind' }, true);
    go(PLACES.clock, 0.5);
    expect(MujinJobs.lamps(sim.mujin!.view)).toBe(1);
    expect(sim.zombies.boss?.variant).toBe('master');
    expect(sim.zombies.boss?.invulnerable).toBe(true);
    expect(sent.some((d) => Array.isArray((d as { mj?: unknown }).mj))).toBe(true);
  });
});
