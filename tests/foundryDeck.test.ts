/**
 * The foundries' charging decks (`foundryDeck` in `world/layout/forgeOuter.ts`): a raised floor up a flight of stairs
 * in every hall. The infected path on one level (the deck's top is open floor to the nav grid, its open edges are
 * not), stand on it (`Zombie.y`, `CollisionWorld.floorHeight`) and follow a player up the stairs.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import type { NetZombie, ZombieEnv } from '../src/enemies/zombie';
import { ZombieManager } from '../src/enemies/zombieManager';
import { Rng } from '../src/logic/rng';
import { createNullRigFactory } from '../src/sim/nullRig';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import type { BoxCollider } from '../src/world/collision';
import { FlowField } from '../src/world/nav';

function forge() {
  const sim = new SessionSim({ seed: 11, kind: 'mission', map: 'forge', send() {} });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  (sim as unknown as { allies: unknown[] }).allies = []; // no squad: nobody else to shoot at or be chased
  const sites = sim.level.data.forge!;
  const world = sim.level.world;
  const inside = (c: BoxCollider, s: { x0: number; z0: number; x1: number; z1: number }): boolean => c.cx > s.x0 && c.cx < s.x1 && c.cz > s.z0 && c.cz < s.z1;
  const decks = sites.furnaces.map((s) => world.colliders.find((c) => c.tag === 'foundry-deck' && inside(c, s))!);
  const stairs = sites.furnaces.map((s) => world.colliders.filter((c) => c.tag === 'foundry-stair' && inside(c, s)));
  return { sim, sites, world, decks, stairs };
}

describe('the foundry decks', () => {
  it('every foundry has one, 2.2 m up a flight of stairs whose steps a player and the infected can climb', () => {
    const { world, decks, stairs } = forge();
    expect(decks.length).toBe(7);
    decks.forEach((d, i) => {
      expect(d, `foundry ${i}`).toBeTruthy();
      expect(d.floor).toBe(true);
      expect(world.floorHeight(d.cx, d.cz, 0.2)).toBeCloseTo(2.2, 5);
      const tops = stairs[i]!.map((c) => c.y1).sort((a, b) => a - b);
      expect(tops.length).toBe(8);
      expect(tops[0]!).toBeLessThan(0.42); // the first step from the floor
      for (let k = 1; k < tops.length; k++) expect(tops[k]! - tops[k - 1]!).toBeLessThan(0.42);
      expect(2.2 - tops[tops.length - 1]!).toBeLessThan(0.42);
    });
  });

  it('is open floor to the nav grid, reached from the hall only by its stairs', () => {
    const { sim, sites, decks, stairs } = forge();
    const nav = sim.level.nav;
    sites.furnaces.forEach((s, i) => {
      const d = decks[i]!;
      expect(nav.isBlockedAt(d.cx, d.cz), `foundry ${i} deck`).toBe(false);
      const field = new FlowField(nav);
      expect(field.compute(d.cx, d.cz)).toBe(true);
      // out of the front door and back in: reachable
      expect(field.isReachable(s.doorX, s.doorZ), `foundry ${i} door`).toBe(true);
      // the stairs' foot is a short climb away
      const foot = stairs[i]!.reduce((a, c) => (c.y1 < a.y1 ? c : a));
      expect(field.distanceMeters(foot.cx, foot.cz)).toBeLessThan(12);
      // the floor just off the deck's inner edge, near its front end (clear of the forge), is close by in a straight
      // line but a walk round by the stairs
      const wideX = d.hx < d.hz; // the deck is narrow across x, long along z
      const across = wideX ? Math.sign((s.x0 + s.x1) / 2 - d.cx) : Math.sign((s.z0 + s.z1) / 2 - d.cz);
      const along = wideX ? Math.sign(s.doorZ - d.cz) || Math.sign((s.z0 + s.z1) / 2 - d.cz) : Math.sign(s.doorX - d.cx) || Math.sign((s.x0 + s.x1) / 2 - d.cx);
      const gx = wideX ? d.cx + across * (d.hx + 0.9) : d.cx + along * (d.hx - 0.6);
      const gz = wideX ? d.cz + along * (d.hz - 0.6) : d.cz + across * (d.hz + 0.9);
      expect(nav.isBlockedAt(gx, gz), `foundry ${i} floor beside the deck`).toBe(false);
      const straight = Math.hypot(gx - d.cx, gz - d.cz);
      expect(field.distanceMeters(gx, gz)).toBeGreaterThan(straight + 3);
    });
  });

  it('the infected follow a player up the stairs onto the deck, and never stand inside it', () => {
    const { sim, sites, world, decks } = forge();
    for (let i = 0; i < sites.furnaces.length; i++) {
      const s = sites.furnaces[i]!;
      const d = decks[i]!;
      // the player at the back of the deck
      const me = { x: d.cx, y: 2.2, z: d.cz };
      const report = (): void => sim.message('p1', { k: 'p', x: me.x, y: me.y, z: me.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
      for (const q of sim.zombies.zombies) if (q.active && Math.hypot(q.x - s.doorX, q.z - s.doorZ) < 30) sim.zombies.remove(q);
      const z = sim.zombies.spawn('runner', s.doorX, s.doorZ, new Rng(5 + i), { state: 'chase' });
      z.hp = z.maxHp = 1e9; // the squad shoots at it: it has to live to get there
      let reached = false;
      for (let f = 0; f < 30 * 25 && !reached; f++) {
        if (f % 3 === 0) report();
        sim.tick(1 / 30);
        expect(world.pointInSolid(z.x, z.y + 0.9, z.z), `foundry ${i}: inside something at ${z.x.toFixed(2)}, ${z.y.toFixed(2)}, ${z.z.toFixed(2)}`).toBe(false);
        if (z.y > 2.1 && Math.hypot(z.x - me.x, z.z - me.z) < 2) reached = true;
      }
      expect(reached, `foundry ${i}: got up to the player (at ${z.x.toFixed(1)}, ${z.y.toFixed(2)}, ${z.z.toFixed(1)})`).toBe(true);
      sim.zombies.remove(z);
    }
  });

  it('a co-op guest stands the host infected on the deck (no height is sent) and its shots hit them up there', () => {
    const { sim, decks } = forge();
    const d = decks[2]!;
    sim.message('p1', { k: 'p', x: d.cx + 6, y: 0, z: d.cz, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    const env = (sim as unknown as { peers: Map<string, { env: ZombieEnv }> }).peers.values().next().value!.env;
    const guest = new ZombieManager(createNullRigFactory(), sim.level);
    const n: NetZombie = { id: 7, type: 'shambler', x: d.cx, z: d.cz, yaw: 0, mode: 'idle', actionT: 0, staggerT: 0, speed: 0, hp: 1, flags: 0, carrier: 0, fy: 0, fp: 0, fr: 0 };
    guest.syncPuppets([n], new Rng(1));
    for (let i = 0; i < 30; i++) guest.updatePuppets(1 / 30, env);
    const z = guest.zombies.find((q) => q.puppet)!;
    expect(z.y).toBeCloseTo(2.2, 5);
    expect(z.rig.root.position.y).toBeCloseTo(2.2, 2);
    // a shot from the hall floor at its chest hits; one at the height its chest would be on the ground passes under
    const shoot = (y: number) => {
      const ox = d.cx + 6;
      const len = Math.hypot(d.cx - ox, y - 1.6);
      return guest.raycast(ox, 1.6, d.cz, (d.cx - ox) / len, (y - 1.6) / len, 0, 40);
    };
    expect(shoot(2.2 + 1.1)?.zombie).toBe(z);
    expect(shoot(0.9)).toBeNull();
  });
});
