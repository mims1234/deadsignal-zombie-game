/**
 * Every map, built from its real colliders: nothing the game needs is out of reach, and there are no sealed pockets
 * (a room, a yard or a gap a player could see into but never enter, or fall into and never leave).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { SessionSim } from '../src/sim/serverHost';
import { MAP_IDS, type MapId } from '../src/world/layout/data';
import { FlowField, UNREACHABLE } from '../src/world/nav';
import type { Level } from '../src/world/level';

/** These checks are about the map itself: every buyable door (the Asylum's) open. The doors' own tests are in asylumLoop. */
function openAllDoors(level: Level): Level {
  level.doors?.setAll(true);
  return level;
}

/** Free (walkable) cells that cannot be reached from the insertion point, grouped into connected pockets. */
function pockets(map: MapId): { sizes: number[]; at: { x: number; z: number; cells: number }[] } {
  const level = openAllDoors(new SessionSim({ map, send: () => {} }).level);
  const nav = level.nav;
  const st = level.data.playerStart;
  const field = new FlowField(nav);
  field.compute(st.x, st.z);
  const seen = new Uint8Array(nav.count);
  const at: { x: number; z: number; cells: number }[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < nav.count; i++) {
    if (seen[i] || nav.blocked[i] || field.dist[i] !== UNREACHABLE) continue;
    // flood this pocket (4-connected)
    const stack = [i];
    seen[i] = 1;
    let n = 0;
    let sx = 0;
    let sz = 0;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const c = k % nav.cols;
      const r = Math.floor(k / nav.cols);
      sx += c;
      sz += r;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dc!;
        const rr = r + dr!;
        if (cc < 0 || rr < 0 || cc >= nav.cols || rr >= nav.rows) continue;
        const kk = rr * nav.cols + cc;
        if (seen[kk] || nav.blocked[kk] || field.dist[kk] !== UNREACHABLE) continue;
        seen[kk] = 1;
        stack.push(kk);
      }
    }
    sizes.push(n);
    at.push({ x: Math.round(nav.minX + (sx / n + 0.5) * nav.cell), z: Math.round(nav.minZ + (sz / n + 0.5) * nav.cell), cells: n });
  }
  return { sizes, at };
}

describe('the Asylum is built clean', () => {
  const level = openAllDoors(new SessionSim({ map: 'asylum', send: () => {} }).level);
  const nav = level.nav;
  const data = level.data;
  const field = new FlowField(nav);
  field.compute(data.playerStart.x, data.playerStart.z);
  const reachable = (x: number, z: number): boolean => field.isReachable(x, z);

  it('places every crate, station, spawn point and resident where it was meant to go', () => {
    expect(level.placement.dropped).toEqual([]);
    for (const m of level.placement.moved) expect(m).toBeDefined(); // moves are allowed (snapped off a prop)
  });

  it('can reach every objective, station, crate, spawn point and resident from the gate', () => {
    const d = data;
    const points: [string, number, number][] = [
      ['power', d.defense.x, d.defense.z],
      ['matron', d.hunt.wardenX, d.hunt.wardenZ],
      ['search', d.hunt.searchX, d.hunt.searchZ],
      ['lz', d.extraction.lzX, d.extraction.lzZ],
      ...d.stations.map((s) => [s.id, s.x, s.z] as [string, number, number]),
      ...d.crates.map((s) => [s.id, s.x, s.z] as [string, number, number]),
      ...d.spawnPoints.map((s, i) => [`spawn${i}`, s.x, s.z] as [string, number, number]),
      ...d.ambient.map((s, i) => [`ambient${i}`, s.x, s.z] as [string, number, number]),
    ];
    const cut = points.filter(([, x, z]) => !reachable(x, z) && !nav.isBlockedAt(x, z)).map(([n, x, z]) => `${n} (${x.toFixed(1)}, ${z.toFixed(1)})`);
    expect(cut).toEqual([]);
  });

  it('can walk into every room: every ward cell, office, the chapel, isolation, the morgue, the boiler house', () => {
    const rooms: [string, number, number][] = [];
    // ward cells: both wings, both sides of the corridor, all six along
    for (const cx of [-22, 22]) {
      for (let k = 0; k < 6; k++) {
        const z = -21.6 + 5.2 * (k + 0.5);
        rooms.push([`cell ${cx} ${k} L`, cx - 4.1, z], [`cell ${cx} ${k} R`, cx + 4.1, z], [`corridor ${cx} ${k}`, cx, z]);
      }
    }
    rooms.push(['hall', 0, 15], ['office W', -8, 8], ['office mid', 0, 8], ['office E', 8, 8], ['gatehouse', -10, 41], ['stores', 36, 35]);
    rooms.push(['chapel aisle', -28, -35], ['isolation hall', 0, -33], ['boiler house', 44, -14], ['autopsy', 25, -34], ['cold room', 33.5, -34]);
    for (const x of [-7.2, -2.4, 2.4, 7.2]) rooms.push([`padded cell ${x}`, x, -39.5]);
    const shut = rooms.filter(([, x, z]) => !reachable(x, z)).map(([n]) => n);
    expect(shut).toEqual([]);
  });

  it('has no sealed pockets bigger than a gap behind a prop', () => {
    const { at } = pockets('asylum');
    // a pocket of a few cells is a sliver behind a crate or a grave; anything bigger is a room nobody can enter
    expect(at.filter((p) => p.cells > 6)).toEqual([]);
  });
});

/**
 * The Forge's rooms are sealed on purpose: the safe rooms (people barricaded themselves in; nobody walks through the
 * front) and the Hearth (the courtyard you see into through its gate). Pockets inside those are expected.
 */
let forgeSites: NonNullable<Level['data']['forge']> | null = null;
function intended(map: MapId, p: { x: number; z: number }): boolean {
  if (map !== 'forge') return false;
  forgeSites ??= new SessionSim({ map, send: () => {} }).level.data.forge!;
  const sites = forgeSites;
  const h = sites.hearth;
  if (Math.abs(p.x - h.x) < 12.5 && Math.abs(p.z - h.z) < 7.5) return true;
  return sites.rooms.some((r) => Math.hypot(p.x - r.inX, p.z - r.inZ) < 5 || Math.hypot(p.x - r.backX, p.z - r.backZ) < 4);
}

describe('every map', () => {
  for (const map of MAP_IDS) {
    it(`${map}: no sealed pockets bigger than a gap behind a prop`, () => {
      const { at } = pockets(map);
      expect(at.filter((p) => p.cells > 6 && !intended(map, p))).toEqual([]);
    });
  }
});
