/**
 * The Sakura District's two ways to play as co-op session kinds: the operation and KAIKA both come in at the district's
 * own start, with both contracts open and the Empress at her theatre.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { LIFE, SessionSim } from '../src/sim/serverHost';

const run = (kind: 'mission' | 'kaika') => {
  const sim = new SessionSim({ seed: 4, kind, map: 'sakura', send() {} });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  return sim;
};

describe('the Sakura District operation and story', { timeout: 30000 }, () => {
  for (const kind of ['mission', 'kaika'] as const) {
    it(`${kind}: the district's start, the relay to do, the Empress not on the map before her moment, the squad alongside`, () => {
      const sim = run(kind);
      const st = sim.level.data.playerStart;
      expect([st.x, st.z]).toEqual([-104, 30]);
      sim.message('p1', { k: 'p', x: st.x, y: 0, z: st.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
      sim.tick(1 / 30);
      const { defense, hunt } = sim.debug as unknown as { defense: { status: string }; hunt: { status: string } };
      expect(defense.status).not.toBe('complete');
      expect(hunt.status).toBe('available');
      expect(sim.zombies.boss).toBeNull();
      const allies = (sim as unknown as { allies: { ref: { x: number; z: number } }[] }).allies;
      expect(allies.length).toBe(2);
      for (const a of allies) expect(Math.hypot(a.ref.x - st.x, a.ref.z - st.z)).toBeLessThan(6);
    });
  }

  it('a co-op session is KAIKA: the Empress wakes on her stage once the trees are red, and never leaves her theatre', () => {
    const sim = run('mission');
    const sv = (sim as unknown as { sakura: { view: { phase: string; marks: number } } }).sakura.view;
    sv.phase = 'bloom';
    sv.marks |= 0b100000; // a relic back from Kisaragi
    const d = sim.debug as unknown as { defense: { status: string }; hunt: { status: string } };
    const at = (x: number, z: number) => sim.message('p1', { k: 'p', x, y: 0, z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    // the bloom: she is there, on the stage inside the theatre (the relay need not be up)
    void d.defense;
    at(20, -30);
    for (let i = 0; i < 3; i++) sim.tick(1 / 30);
    expect(d.hunt.status).toBe('active');
    const b = sim.zombies.boss!;
    expect(b).not.toBeNull();
    expect(Math.hypot(b.x - 20, b.z - -57.5)).toBeLessThan(3);
    expect(b.maxHp).toBeGreaterThan(0);
    const warden = sim.zombies.bossHpMul;
    expect(warden).toBe(2); // twice the Warden's health
    // someone close draws her out; then they run down the street, and she stays on her ground
    b.aggro(20, -30);
    for (let i = 0; i < 30 * 40; i++) {
      at(i < 30 * 8 ? 20 : -60, i < 30 * 8 ? -30 : 14);
      sim.tick(1 / 30);
      expect(b.x).toBeGreaterThanOrEqual(-19);
      expect(b.z).toBeLessThanOrEqual(-26);
    }
    // whatever she is after now (the player who ran, or the Court's gunfire), it is inside her theatre
    expect(b.quarry.x).toBeGreaterThanOrEqual(-22);
    expect(b.quarry.z).toBeLessThanOrEqual(-23);
  });

  it('KAIKA: the Empress stays off the map until the trees are red and the relics are back, whatever is done', () => {
    const sim = run('kaika');
    const s = sim as unknown as { sakura: { view: { phase: string } } };
    const d = sim.debug as unknown as { defense: { status: string }; hunt: { status: string } };
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        sim.message('p1', { k: 'p', x: 20, y: 0, z: -40, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
        sim.tick(1 / 30);
      }
    };
    d.defense.status = 'complete';
    tick(10);
    expect(d.hunt.status).toBe('available');
    expect(sim.zombies.boss).toBeNull();
    s.sakura.view.phase = 'bloom';
    tick(10);
    expect(d.hunt.status).toBe('available'); // the trees are red, but nobody has been to Kisaragi
    (s.sakura.view as unknown as { marks: number }).marks |= 0b100000;
    tick(10);
    expect(d.hunt.status).toBe('active');
    expect(sim.zombies.boss).not.toBeNull();
  });

  it('the Court holds its own ground: nobody from the freight yard follows anyone into the streets', () => {
    const sim = run('mission');
    const at = (x: number, z: number) => sim.message('p1', { k: 'p', x, y: 0, z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    const court = () => sim.zombies.zombies.filter((z) => z.alive && z.variant === 'court');
    expect(court().length).toBeGreaterThan(0);
    for (const z of court()) z.aggro(100, -20);
    for (let i = 0; i < 30 * 30; i++) {
      at(i < 30 * 3 ? 100 : 20, i < 30 * 3 ? -20 : 14);
      sim.tick(1 / 30);
    }
    for (const z of court()) {
      const inTheatre = z.x >= -19 && z.x <= 67 && z.z >= -66 && z.z <= -26;
      const inYard = z.x >= 77 && z.x <= 128 && z.z >= -66 && z.z <= -26;
      expect(inTheatre || inYard).toBe(true);
    }
  });
});

describe('the procession', { timeout: 30000 }, () => {
  it('after the bloom, calling the helicopter brings three waves up the hill, the later ones heavy', () => {
    const sim = run('mission');
    const s = sim as unknown as { sakura: { view: { phase: string } }; extraction: { phase: string; countdown: number }; zombies: { zombies: { variant: string; alive: boolean }[] } };
    const count = (v: string) => s.zombies.zombies.filter((z) => z.alive && z.variant === v).length;
    const lz = sim.level.data.extraction;
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        sim.message('p1', { k: 'p', x: lz.lzX, y: 0, z: lz.lzZ, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
        sim.tick(1 / 30);
      }
    };
    const oni0 = count('oni');
    const bloomed0 = count('bloomed');
    // no bloom: a call brings no procession
    s.extraction.phase = 'called';
    s.extraction.countdown = 60;
    step(60);
    expect(count('bloomed')).toBeLessThanOrEqual(bloomed0);
    // the bloom: it comes
    s.sakura.view.phase = 'bloom';
    // the waves come up from the landing zone's own spawn points (out of sight), mostly the blood-moon kinds: count
    // what the director sends (the squad shoots them as they come)
    const zm = s.zombies as unknown as { spawn: (...a: unknown[]) => { variant: string } };
    const sent: string[] = [];
    const spawn = zm.spawn.bind(zm);
    zm.spawn = (...a: unknown[]) => {
      const z = spawn(...a);
      sent.push(z.variant);
      return z;
    };
    step(30 * 8);
    expect(sent.length).toBeGreaterThanOrEqual(8);
    expect(sent.filter((v) => v === 'bloomed' || v === 'rooted').length).toBeGreaterThanOrEqual(4);
    step(30 * 34); // the second and the third: oni among them
    expect(sent.filter((v) => v === 'oni').length).toBeGreaterThanOrEqual(1);
    void oni0;
  });

  it('the Court and the infected fight each other, and a Court kill pays the nearest player', () => {
    const sent: { k: string; n?: string; c?: number }[] = [];
    const sim = new SessionSim({ seed: 9, kind: 'mission', map: 'sakura', send: (_to, d) => sent.push(d as { k: string }) });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const at = (x: number, z: number) => sim.message('p1', { k: 'p', x, y: 0, z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    // a Court member on the ground before the theatre, an infected in the open near him, the player well away
    const c = sim.zombies.zombies.find((z) => z.alive && z.variant === 'court' && z.y < 0.5)!;
    expect(c).toBeDefined();
    const rng = (sim as unknown as { rng: never }).rng;
    const prey = sim.zombies.spawn('shambler', c.x + 7, c.z + 3, rng, { variant: 'bloomed' });
    for (let i = 0; i < 30 * 12 && prey.alive; i++) {
      at(c.x + 40, c.z + 30);
      sim.tick(1 / 30);
    }
    expect(prey.alive).toBe(false);
    expect(sent.some((m) => m.k === 'kill' && /COURT KILL/.test(m.n ?? '') && (m.c ?? 0) > 0)).toBe(true);
  });
});
