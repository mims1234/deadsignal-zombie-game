/**
 * The Forge's story operation (`src/forge/`), run by the co-op simulation exactly as the solo game runs it: the roster,
 * the holdouts in their rooms and the infected at their doors (who never get in), talking someone out, the vault,
 * the furnaces, the ledger, riry's bell, the Hearth's sentry, the last stand, the last carrier and the burnout; and how
 * it all goes over the wire.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { FORGE_SQUAD, FORGE_STORY, MISSION, VULCAN, VULCAN_LEADERSHIP } from '../src/config';
import { LEADERSHIP_NAMES, SIGNATURE_NAMES, vulcanLook } from '../src/forge/looks';
import { decodeView, encodeRoster, encodeState } from '../src/forge/net';
import { pickForgeRoster } from '../src/forge/roster';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';

function forgeRun(seed = 11) {
  const out: { to: string; d: Record<string, unknown> }[] = [];
  const sim = new SessionSim({ seed, kind: 'mission', map: 'forge', send: (to, d) => out.push({ to, d }) });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  const st = sim.level.data.playerStart;
  const me = { x: st.x, z: st.z, st: LIFE.up as number };
  const report = (): void => sim.message('p1', { k: 'p', x: me.x, y: 0, z: me.z, yaw: 0, up: me.st === LIFE.up, st: me.st, hp: 100 }, false);
  const run = (seconds: number): void => {
    for (let i = 0; i < seconds * 30; i++) {
      if (i % 3 === 0) report();
      sim.tick(1 / 30);
    }
  };
  const story = sim.forge!;
  const sites = sim.level.data.forge!;
  /** Kill everything on its feet near (x, z). */
  const clear = (x: number, z: number, r = FORGE_STORY.doorClear + 1): void => {
    for (const q of sim.zombies.zombies) if (q.active && Math.hypot(q.x - x, q.z - z) < r) sim.message('p1', { k: 'hit', z: q.id, a: 600, h: true, y: 0 }, false);
  };
  return { sim, out, me, run, story, sites, clear };
}

describe('the Forge: who is where', () => {
  it('draws two different co-leaders for the squad, the rest holed up, Anya in the radio room, tomoe in the vault, four members', () => {
    const { story, sites } = forgeRun();
    const v = story.view;
    expect(v.squad.length).toBe(2);
    expect(new Set(v.squad).size).toBe(2);
    const left = VULCAN_LEADERSHIP.coLeads.filter((n) => !v.squad.includes(n));
    expect(left.length).toBe(VULCAN_LEADERSHIP.coLeads.length - 2);
    const names = v.holdouts.map((h) => h.name);
    for (const n of left) expect(names).toContain(n);
    expect(names).toContain('Anya');
    expect(names).toContain('tomoe');
    expect(v.holdouts.filter((h) => h.rank === 'member').length).toBe(FORGE_STORY.members);
    const room = (n: string): string => sites.rooms[v.holdouts.find((h) => h.name === n)!.room]!.id;
    expect(room('tomoe')).toBe('vault');
    expect(room('Anya')).toBe('radio');
    // one person per room
    expect(new Set(v.holdouts.map((h) => h.room)).size).toBe(v.holdouts.length);
  });

  it('is the same roster for the same seed, and the carrier is always an ordinary member', () => {
    const { sites } = forgeRun();
    for (let s = 1; s < 60; s++) {
      const a = pickForgeRoster(new Rng(s), sites.rooms);
      const b = pickForgeRoster(new Rng(s), sites.rooms);
      expect(a).toEqual(b);
      expect(a.holdouts[a.carrier]!.rank).toBe('member');
    }
  });

  it('never has someone holed up and infected at once', () => {
    const { sim, story, run } = forgeRun();
    run(2);
    const alive = new Set(story.view.holdouts.map((h) => h.name));
    for (const z of sim.zombies.zombies) if (z.tag) expect(alive.has(z.tag)).toBe(false);
  });
});

describe('the Forge: the doors', () => {
  it('puts infected at every occupied door, and they pound on it but never get in', () => {
    const { sim, story, sites, run } = forgeRun();
    const occupied = story.view.holdouts.map((h) => h.room);
    for (const i of occupied) expect(story.siege.count(i)).toBeGreaterThanOrEqual(FORGE_STORY.siege.min);
    run(25);
    for (const i of occupied) {
      const r = sites.rooms[i]!;
      // nothing on the inside of the door
      for (const z of sim.zombies.zombies) {
        if (!z.alive) continue;
        expect(Math.hypot(z.x - r.inX, z.z - r.inZ) > 0.8 || Math.hypot(z.x - r.doorX, z.z - r.doorZ) < Math.hypot(r.inX - r.doorX, r.inZ - r.doorZ) - 0.5).toBe(true);
      }
      expect(sim.level.nav.isBlockedAt(r.inX, r.inZ) || !sim.level.nav.los(r.doorX, r.doorZ, r.inX, r.inZ)).toBe(true);
    }
  });

  it('lets go of the door when someone comes close', () => {
    const { sim, story, sites, me, run } = forgeRun();
    const h = story.view.holdouts.find((q) => !sites.rooms[q.room]!.vault)!;
    const r = sites.rooms[h.room]!;
    const before = story.siege.count(h.room);
    expect(before).toBeGreaterThan(0);
    me.x = r.doorX + r.nx * 6;
    me.z = r.doorZ + r.nz * 6;
    run(1.5);
    expect(story.siege.count(h.room)).toBeLessThan(before);
    void sim;
  });

  it('keeps the door shut while infected are at it, opens it once it is clear, and the vault only after the beacon', () => {
    const { sim, story, sites, me, run, clear } = forgeRun();
    const i = story.view.holdouts.findIndex((q) => !sites.rooms[q.room]!.vault);
    const h = story.view.holdouts[i]!;
    const r = sites.rooms[h.room]!;
    me.x = r.doorX + r.nx * 1.2;
    me.z = r.doorZ + r.nz * 1.2;
    run(0.3);
    sim.message('p1', { k: 'hold', i }, false);
    expect(story.view.holdouts[i]!.phase).toBe('room');
    for (let k = 0; k < 6; k++) {
      clear(r.doorX, r.doorZ);
      run(0.3);
    }
    sim.message('p1', { k: 'hold', i }, false);
    expect(story.view.holdouts[i]!.phase).toBe('hearth');
    expect(story.siege.occupied[h.room]).toBe(false);
    // tomoe's vault: sealed until the beacon burns
    const t = story.view.holdouts.findIndex((q) => sites.rooms[q.room]!.vault);
    const v = sites.rooms[story.view.holdouts[t]!.room]!;
    me.x = v.doorX;
    me.z = v.doorZ;
    for (let k = 0; k < 6; k++) {
      clear(v.doorX, v.doorZ);
      run(0.3);
    }
    expect(story.rescueState(t, me.x, me.z)).toBe('sealed');
    sim.debug.defense.status = 'complete';
    run(0.2);
    clear(v.doorX, v.doorZ);
    run(0.2);
    sim.message('p1', { k: 'hold', i: t }, false);
    expect(story.view.holdouts[t]!.phase).toBe('hearth');
  });
});

describe('the Forge: the ledger and the Pit', () => {
  it('takes a page only from someone standing at it', () => {
    const { sim, story, sites, me, run } = forgeRun();
    sim.message('p1', { k: 'ledger', i: 0 }, false);
    expect(story.view.ledger[0]).toBe(false);
    me.x = sites.ledger[0]!.x;
    me.z = sites.ledger[0]!.z;
    run(0.3);
    sim.message('p1', { k: 'ledger', i: 0 }, false);
    expect(story.view.ledger[0]).toBe(true);
  });

  it("rings riry's bell for three waves, then it is done", () => {
    const { sim, story, sites, me, run } = forgeRun();
    const pit = sites.rumble;
    me.x = pit.bellX;
    me.z = pit.bellZ + 0.5;
    run(0.3);
    sim.message('p1', { k: 'bell' }, false);
    expect(story.view.rumble.phase).toBe('wave');
    for (let w = 0; w < FORGE_STORY.rumble.waves.length; w++) {
      for (let k = 0; k < 30 && story.view.rumble.phase === 'wave' && story.view.rumble.wave === w; k++) {
        for (const q of sim.zombies.zombies) if (q.active && Math.hypot(q.x - pit.x, q.z - pit.z) < 40) sim.message('p1', { k: 'hit', z: q.id, a: 600, h: true, y: 0 }, false);
        run(0.2);
      }
      run(FORGE_STORY.rumble.gap + 0.5);
    }
    expect(story.view.rumble.phase).toBe('done');
  });
});

describe('the Forge: the furnaces', () => {
  it('has the seven foundries, one for each ember, each one a hall you can walk into', () => {
    const { story, sites } = forgeRun();
    const f = story.view.furnaces;
    expect(sites.furnaces.length).toBe(FORGE_SQUAD.flames.length);
    expect(f.length).toBe(FORGE_STORY.furnaces.count);
    expect(f.map((q) => q.flame)).toEqual(FORGE_SQUAD.flames.map((_, i) => i));
    for (const q of f) {
      expect(q.phase).toBe('cold');
      const s = sites.furnaces[q.spot]!;
      // you stand to stoke it inside the hall, and the hall is reachable on foot from the Hearth and its door
      expect(story.inFoundry(q.spot, s.x, s.z)).toBe(true);
      expect(story.assault.reachable(s.x, s.z)).toBe(true);
      expect(story.assault.reachable(s.doorX, s.doorZ)).toBe(true);
    }
    // spread out over the map
    for (let a = 0; a < sites.furnaces.length; a++) for (let b = a + 1; b < sites.furnaces.length; b++) {
      const A = sites.furnaces[a]!;
      const B = sites.furnaces[b]!;
      expect(Math.hypot(A.x - B.x, A.z - B.z)).toBeGreaterThan(25);
    }
  });

  it('is stoked only from in front of it, catches only while its circle is held, and draws the infected in', () => {
    const { sim, story, sites, me, run } = forgeRun();
    sim.message('p1', { k: 'stoke', i: 0 }, false);
    expect(story.view.furnaces[0]!.phase).toBe('cold');
    const at = story.furnaceFront(0)!;
    me.x = at.x;
    me.z = at.z;
    run(0.3);
    const before = sim.zombies.zombies.length;
    sim.message('p1', { k: 'stoke', i: 0 }, false);
    const f = story.view.furnaces[0]!;
    expect(f.phase).toBe('burning');
    run(10);
    expect(f.progress).toBeGreaterThan(0.25);
    expect(sim.zombies.zombies.length).toBeGreaterThan(before);
    // walk out of the hall: it stops catching
    const s = sites.furnaces[f.spot]!;
    me.x = s.doorX + (s.doorX - s.x) * 3;
    me.z = s.doorZ + (s.doorZ - s.z) * 3;
    run(0.2);
    const held = f.progress;
    run(5);
    expect(f.progress).toBeCloseTo(held, 5);
    // back in the circle until it catches
    me.x = at.x;
    me.z = at.z;
    run(FORGE_STORY.furnaces.hold + 1);
    expect(f.phase).toBe('lit');
  }, 30000);
});

describe('the Forge: the Hearth', () => {
  it('is where the run starts, open to walk into, and its sentry cuts down infected inside but never a boss', () => {
    const { sim, story, sites, me, run } = forgeRun();
    const h = sites.hearth;
    const st = sim.level.data.playerStart;
    expect(st.x > h.x0 && st.x < h.x1 && st.z > h.z0 && st.z < h.z1).toBe(true);
    // walkable from the streets: the gate is open
    const nav = sim.level.nav;
    expect(story.assault.reachable(st.x, st.z)).toBe(true);
    expect(story.assault.reachable(h.gateX, h.gateZ + 20)).toBe(true);
    expect(nav.isBlockedAt(h.gateX, h.z1 + 0.2)).toBe(false);
    // stay out of the way, far off
    me.x = h.gateX + 40;
    me.z = h.gateZ + 30;
    run(0.2);
    const rng = new Rng(77);
    const z = sim.zombies.spawn('shambler', h.gateX - 4, h.z1 - 2, rng);
    const boss = sim.zombies.spawn('warden', h.gateX + 5, h.z0 + 2, rng, { boss: true });
    const shots = story.view.sentry.shots;
    run(4);
    expect(z.alive).toBe(false);
    expect(story.view.sentry.shots).toBeGreaterThan(shots);
    expect(boss.hp).toBe(boss.maxHp);
  });
});

describe('the Forge: the Hearth round the helipad', () => {
  it('walls in the landing zone with a gate open in every side, and the one sentry covers all four', () => {
    const { sim, story, sites, me, run } = forgeRun();
    const h = sites.hearth;
    const e = sim.level.data.extraction;
    expect(e.heliX > h.x0 && e.heliX < h.x1 && e.heliZ > h.z0 && e.heliZ < h.z1).toBe(true);
    expect(h.gates.length).toBe(4);
    const nav = sim.level.nav;
    for (const g of h.gates) {
      expect(nav.isBlockedAt(g.x, g.z)).toBe(false);
      expect(story.assault.reachable(g.x + g.nx * 8, g.z + g.nz * 8)).toBe(true);
    }
    me.x = h.x + 60;
    me.z = h.z + 40;
    run(0.2);
    const rng = new Rng(5);
    for (const g of h.gates) {
      const z = sim.zombies.spawn('shambler', g.x + g.nx * 2.5, g.z + g.nz * 2.5, rng);
      run(4);
      expect(z.alive).toBe(false);
    }
  });

  it('gives the people there a weak shotgun each: they shoot the infected near them, never a boss', () => {
    const { sim, story, sites, me, run } = forgeRun();
    const h = sites.hearth;
    me.x = h.x + 60;
    me.z = h.z + 40;
    run(0.2);
    const i = story.view.holdouts.findIndex((p) => !sites.rooms[p.room]!.vault);
    const p = story.view.holdouts[i]!;
    p.phase = 'hearth';
    p.slot = 6;
    const s = h.slots[6]!;
    const rng = new Rng(9);
    const boss = sim.zombies.spawn('warden', s.x + 2.5, s.z - 3, rng, { boss: true });
    const z = sim.zombies.spawn('shambler', s.x + 4, s.z - 5, rng);
    const before = story.view.guards[i]!.shots;
    run(1.5);
    expect(story.view.guards[i]!.shots).toBeGreaterThan(before);
    expect(Math.hypot(story.view.guards[i]!.tx - s.x - 4, story.view.guards[i]!.tz - s.z + 5)).toBeLessThan(3);
    expect(z.hp < z.maxHp || !z.alive).toBe(true);
    expect(boss.hp).toBe(boss.maxHp);
  });
});

describe('the Forge: the last carrier', () => {
  it('is reborn after the call, holds the bird off, takes the Hearth but never everyone, and its death burns the virus out', () => {
    const { sim, story, sites, me, run, clear } = forgeRun(5);
    // everyone (but tomoe) to the Hearth
    story.view.holdouts.forEach((h, i) => {
      const r = sites.rooms[h.room]!;
      if (r.vault) return;
      me.x = r.doorX + r.nx * 1.2;
      me.z = r.doorZ + r.nz * 1.2;
      for (let k = 0; k < 8 && story.view.holdouts[i]!.phase === 'room'; k++) {
        clear(r.doorX, r.doorZ);
        run(0.3);
        sim.message('p1', { k: 'hold', i }, false);
      }
    });
    expect(story.view.holdouts.filter((h) => h.phase === 'hearth').length).toBe(story.view.holdouts.length - 1);
    // the contracts done, the call made
    sim.debug.defense.status = 'complete';
    sim.debug.hunt.status = 'complete';
    run(0.3);
    const e = sim.level.data.extraction;
    me.x = e.terminalX - 1;
    me.z = e.terminalZ;
    run(0.4);
    sim.message('p1', { k: 'call' }, false);
    expect(sim.debug.extraction.phase).toBe('called');
    expect(story.view.finale.carrier).toBe(-1); // nobody can see it coming
    run(0.1);
    expect(story.view.assault).toBe('on'); // the last stand begins with the call
    expect(story.quietDirector).toBe(true);
    run(FORGE_STORY.finale.delayMax + 1);
    expect(story.view.finale.phase).toBe('reborn');
    const carrier = story.view.holdouts[story.view.finale.carrier]!;
    expect(carrier.rank).toBe('member');
    expect(carrier.phase).toBe('reborn');
    const reborn = story.reborn!;
    expect(reborn.alive).toBe(true);
    expect(reborn.tag).toBe(carrier.name);
    // the helicopter waits while it lives (the co-leaders shoot it too, so it may not live long)
    const cd = sim.debug.extraction.countdown;
    for (let k = 0; k < 12 && reborn.alive; k++) {
      run(1);
      if (reborn.alive) expect(sim.debug.extraction.countdown).toBeCloseTo(cd, 3);
    }
    // the Hearth: people fall (to the assault and to the reborn), never the last one
    const hearth = story.view.holdouts.filter((h) => h.phase === 'hearth');
    expect(hearth.length).toBeGreaterThanOrEqual(FORGE_STORY.finale.keep);
    const fallen = story.view.holdouts.filter((h) => h.phase === 'fallen');
    expect(fallen.length).toBeGreaterThan(0);
    // kill it: the burnout takes every infected left, and the bird comes in
    for (let k = 0; k < 40 && reborn.alive; k++) sim.message('p1', { k: 'hit', z: reborn.id, a: 600, h: true, y: 0 }, false);
    expect(reborn.alive).toBe(false);
    run(14);
    expect(story.view.finale.phase).toBe('burnout');
    expect(story.view.assault).toBe('over');
    expect(sim.zombies.zombies.filter((z) => z.alive).length).toBe(0);
    // (the squad stands with you in the Hearth, so the reborn may fall fast: the bird can be close already)
    for (let k = 0; k < MISSION.extraction.countdown + 2 && sim.debug.extraction.phase !== 'landed'; k++) run(1);
    expect(sim.debug.extraction.phase).toBe('landed');
  }, 30000);
});

describe('the Forge: on the wire and in the looks', () => {
  it('sends the roster and the state, and reads them back', () => {
    const { story } = forgeRun();
    const { sites } = forgeRun();
    story.view.ledger[2] = true;
    story.view.holdouts[1]!.phase = 'hearth';
    story.view.holdouts[1]!.slot = 3;
    story.view.furnaces[2]!.phase = 'burning';
    story.view.furnaces[2]!.progress = 0.42;
    story.view.furnaces[4]!.phase = 'lit';
    story.view.furnaces[4]!.progress = 1;
    story.view.sentry = { yaw: 1.23, shots: 17, tx: -41.5, tz: -60.2 };
    story.view.assault = 'on';
    story.view.guards[1] = { shots: 9, tx: -44.5, tz: -24.1 };
    const back = decodeView(JSON.parse(JSON.stringify(encodeRoster(story.view))), JSON.parse(JSON.stringify(encodeState(story.view))), story.view.ledger.length, sites.furnaces.length)!;
    expect(back.squad).toEqual(story.view.squad);
    expect(back.holdouts.map((h) => [h.name, h.rank, h.room, h.phase, h.slot])).toEqual(story.view.holdouts.map((h) => [h.name, h.rank, h.room, h.phase, h.slot]));
    expect(back.ledger).toEqual(story.view.ledger);
    expect(back.furnaces).toEqual(story.view.furnaces);
    expect(back.sentry).toEqual(story.view.sentry);
    expect(back.guards).toEqual(story.view.guards);
    expect(back.assault).toBe('on');
    expect(back.finale.carrier).toBe(-1);
    expect(decodeView(null, encodeState(story.view), 4, 16)).toBeNull();
  });

  it('gives everyone the same look for the same name, and every signature item belongs to a current member', () => {
    for (const n of VULCAN.infected) expect(vulcanLook(n)).toEqual(vulcanLook(n));
    for (const n of SIGNATURE_NAMES) expect(VULCAN.infected as readonly string[]).toContain(n);
    for (const n of [VULCAN_LEADERSHIP.leader, ...VULCAN_LEADERSHIP.coLeads, ...VULCAN_LEADERSHIP.officers]) expect(LEADERSHIP_NAMES).toContain(n);
    expect(vulcanLook('tomoe').look.hero).toBe(true);
  });
});
