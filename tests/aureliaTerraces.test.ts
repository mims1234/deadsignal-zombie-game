/**
 * Aurelia's terraces (`world/layout/aurelia.ts`): three raised rings round the summit, reached only by their stairs.
 * A player can walk up every flight, nobody walks off an edge or up a wall, and the infected follow a player from the
 * ferry landing all the way up to the Phoenix Shrine.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../src/config';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { AURELIA, AURELIA_TERRACES as T } from '../src/world/layout/aurelia';

const deg = Math.PI / 180;

function aurelia() {
  const sim = new SessionSim({ seed: 3, kind: 'mission', map: 'aurelia', send() {} });
  return { sim, world: sim.level.world, nav: sim.level.nav };
}

/** Is the edge of terrace `tier` on bearing `a` (degrees) within `slack` metres of the side of a flight onto it? */
const nearStairs = (tier: number, a: number, slack: number): boolean =>
  T.stairs.some((s) => s.tier === tier && Math.cos((s.at - a) * deg) > 0 && Math.abs(T.tiers[tier]!.r * Math.sin((s.at - a) * deg)) < s.w / 2 + slack);

describe('Aurelia: the terraces', () => {
  it('each ring stands at its own height all the way round', () => {
    const { world } = aurelia();
    T.tiers.forEach((tier, k) => {
      const inner = k + 1 < T.tiers.length ? T.tiers[k + 1]!.r : 0;
      const r = (tier.r + inner) / 2 + (k === 2 ? 2 : 0);
      for (let a = -180; a < 180; a += 15) {
        const p = T.polar(r, a * deg);
        if (p.z < T.backZ + 1.5) continue;
        expect(world.floorHeight(p.x, p.z, 0.3), `ring ${k} at ${a} deg`).toBeCloseTo(tier.y, 5);
      }
    });
  });

  it('a player can walk up every flight, one step at a time, without running into anything', () => {
    const { world } = aurelia();
    for (const s of T.stairs) {
      const tier = T.tiers[s.tier]!;
      const lower = s.tier === 0 ? 0 : T.tiers[s.tier - 1]!.y;
      const a = s.at * deg;
      let y = lower;
      // from 1.5 m beyond the foot to 2 m onto the terrace, straight up the middle
      for (let r = tier.r + T.run + 1.5; r >= tier.r - 2; r -= 0.08) {
        const p = T.polar(r, a);
        const ground = world.groundHeight(p.x, p.z, PLAYER.radius * 0.92, y + PLAYER.stepHeight + 0.001);
        expect(ground - y, `flight onto ring ${s.tier} at ${s.at} deg: step at r ${r.toFixed(2)}`).toBeLessThan(PLAYER.stepHeight);
        y = ground;
        const q = { x: p.x, z: p.z };
        expect(world.resolveCircle(q, PLAYER.radius, y + PLAYER.stepHeight, y + PLAYER.heightStand, 4), `flight onto ring ${s.tier} at ${s.at} deg: blocked at r ${r.toFixed(2)}`).toBe(false);
      }
      expect(y, `flight onto ring ${s.tier} at ${s.at} deg`).toBeCloseTo(tier.y, 5);
    }
  });

  it('every edge away from the stairs is a wall: nobody climbs up or walks off', () => {
    const { world, nav } = aurelia();
    T.tiers.forEach((tier, k) => {
      for (let a = -170; a <= 170; a += 10) {
        if (nearStairs(k, a, 1)) continue;
        const edge = T.polar(tier.r, a * deg);
        if (edge.z < T.backZ + 1) continue;
        expect(nav.isBlockedAt(edge.x, edge.z), `ring ${k} edge at ${a} deg`).toBe(true);
        // from the terrace, walking out over the edge in small steps, as a player moves
        const p = T.polar(tier.r - 1.2, a * deg);
        const out = { x: Math.sin(a * deg) * 0.08, z: Math.cos(a * deg) * 0.08 };
        for (let i = 0; i < 40; i++) {
          p.x += out.x;
          p.z += out.z;
          world.resolveCircle(p, PLAYER.radius, tier.y + PLAYER.stepHeight, tier.y + PLAYER.heightStand, 6);
        }
        expect(Math.hypot(p.x - T.summit.x, p.z - T.summit.z), `ring ${k} at ${a} deg: walked off`).toBeLessThan(tier.r);
      }
    });
  });

  it('the walls beside the stairs are no taller than they look: a shot just over one flies on', () => {
    const { world } = aurelia();
    const cheeks = world.colliders.filter((c) => c.tag === 'stair-cheek');
    expect(cheeks.length).toBe(T.stairs.length * 8 * 2);
    for (const c of cheeks) {
      // across the flight, from 1.5 m out, 10 cm above the wall's drawn top
      const tx = Math.cos(c.rot);
      const tz = -Math.sin(c.rot);
      // drawn 0.9 m above the step beside it, and solid no higher
      const step = Math.max(world.floorHeight(c.cx + tx * 0.6, c.cz + tz * 0.6, 0.1), world.floorHeight(c.cx - tx * 0.6, c.cz - tz * 0.6, 0.1));
      expect(c.y1, `stair wall at ${c.cx.toFixed(1)}, ${c.cz.toFixed(1)}`).toBeLessThanOrEqual(step + 0.9 + 1e-6);
      const y = c.y1 + 0.1;
      const hit = world.raycast(c.cx - tx * 1.5, y, c.cz - tz * 1.5, tx, 0, tz, 3, 'shots');
      expect(hit?.collider === c, `stair wall at ${c.cx.toFixed(1)}, ${c.cz.toFixed(1)} stops a shot at ${y.toFixed(2)} m`).toBe(false);
    }
    // and a stone parapet stops shots no higher than its top
    for (const c of world.colliders.filter((q) => q.tag === 'terrace-rim' && q.blocksShots)) expect(c.y1).toBeCloseTo(T.tiers[0]!.y + 0.9, 5);
  });

  it('the infected follow a player from the ferry landing up to the Phoenix Shrine', () => {
    const { sim, world } = aurelia();
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    (sim as unknown as { allies: unknown[] }).allies = []; // nobody else to chase or be shot by
    const shrine = AURELIA.shrine;
    const me = { x: shrine.x, y: shrine.y, z: shrine.z + 5 };
    for (const q of [...sim.zombies.zombies]) if (q.active) sim.zombies.remove(q);
    const z = sim.zombies.spawn('runner', AURELIA.start.x + 3, AURELIA.start.z - 4, new Rng(9), { state: 'chase' });
    z.hp = z.maxHp = 1e9;
    let reached = false;
    for (let f = 0; f < 30 * 60 && !reached; f++) {
      if (f % 3 === 0) sim.message('p1', { k: 'p', x: me.x, y: me.y, z: me.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
      sim.tick(1 / 30);
      expect(world.pointInSolid(z.x, z.y + 0.9, z.z), `inside something at ${z.x.toFixed(2)}, ${z.y.toFixed(2)}, ${z.z.toFixed(2)}`).toBe(false);
      if (z.y > shrine.y - 0.1 && Math.hypot(z.x - me.x, z.z - me.z) < 2.5) reached = true;
    }
    expect(reached, `got up to the player (at ${z.x.toFixed(1)}, ${z.y.toFixed(2)}, ${z.z.toFixed(1)})`).toBe(true);
  });
});
