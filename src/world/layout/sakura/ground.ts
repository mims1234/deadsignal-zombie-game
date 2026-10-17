/**
 * The Sakura District's ground and streets: the base ground (left open where the canal and the stairwells go down),
 * the four roads cracked and grown over, pavements, the boundary wall, the city beyond it, dead street lights and
 * sagging wires, cars left where they stopped, and the threat regions and map labels.
 */
import * as THREE from 'three';
import { skylineBackdrop } from '../../landmarks';
import { debris, streetLamp, utilityPole, vehicle, roadSign, trafficLight, cones } from '../../props';
import { groundDecal, groundRect, perimeterWall } from '../../structures';
import type { Ctx } from '../util';
import { CANAL, ROADS, SAKURA_BOUNDS, type Rect, ZONES } from './consts';
import { cherryTree, grass, petals, vendingMachine } from './props';

/** Cover `outer` with rectangles, leaving `holes` (axis-aligned, inside it) uncovered. */
export function rectsAround(outer: Rect, holes: Rect[]): Rect[] {
  const xs = [...new Set([outer.x0, outer.x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= outer.x0 && x <= outer.x1).sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    const cuts = holes.filter((h) => h.x0 <= x0 && h.x1 >= x1).map((h) => [h.z0, h.z1] as const).sort((a, b) => a[0] - b[0]);
    let z = outer.z0;
    for (const [z0, z1] of cuts) {
      if (z0 > z) out.push({ x0, z0: z, x1, z1: z0 });
      z = Math.max(z, z1);
    }
    if (z < outer.z1) out.push({ x0, z0: z, x1, z1: outer.z1 });
  }
  return out;
}

/** The base ground, the roads and pavements, the boundary, the skyline. `holes`: where the ground opens downward. */
export function buildSakuraGround(c: Ctx, holes: Rect[]): void {
  const { b, d } = c;
  const B = SAKURA_BOUNDS;
  // the base ground, far out past the wall, open over the canal and the stairwells
  const outer = { x0: B.minX - 220, z0: B.minZ - 220, x1: B.maxX + 220, z1: B.maxZ + 260 };
  for (const r of rectsAround(outer, holes)) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), b.mats.get('dirt'));
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, -0.02, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    b.add(m);
  }
  // the roads, wet and cracked; the pavements round every block
  for (const r of Object.values(ROADS)) {
    const pieces = rectsAround({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }, holes);
    for (const p of pieces) groundRect(b, 'asphaltWet', p.x0, p.z0, p.x1, p.z1, 0.012);
    d.road(r.x0, r.z0, r.x1, r.z1, r.name);
  }
  for (const z of Object.values(ZONES)) {
    for (const p of rectsAround({ x0: z.x0, z0: z.z0, x1: z.x1, z1: z.z1 }, holes)) groundRect(b, 'sidewalk', p.x0, p.z0, p.x1, p.z1, 0.02);
  }
  perimeterWall(b, B.minX, B.minZ, B.maxX, B.minZ, 6, 'concreteWall');
  perimeterWall(b, B.minX, B.maxZ, B.maxX, B.maxZ, 6, 'concreteWall');
  perimeterWall(b, B.minX, B.minZ, B.minX, B.maxZ, 6, 'concreteWall');
  perimeterWall(b, B.maxX, B.minZ, B.maxX, B.maxZ, 6, 'concreteWall');
  skylineBackdrop(b, { bounds: { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ }, seed: 77 });

  // ---- the roads, seven springs on: cracks, grass, the odd young cherry tree through the asphalt ----
  const rnd = c.rng;
  for (const r of Object.values(ROADS)) {
    const len = Math.max(r.x1 - r.x0, r.z1 - r.z0);
    const alongX = r.x1 - r.x0 > r.z1 - r.z0;
    for (let i = 0; i < len / 9; i++) {
      const t = rnd.f();
      const x = alongX ? r.x0 + t * (r.x1 - r.x0) : r.x0 + 1 + rnd.f() * (r.x1 - r.x0 - 2);
      const z = alongX ? r.z0 + 1 + rnd.f() * (r.z1 - r.z0 - 2) : r.z0 + t * (r.z1 - r.z0);
      if (holes.some((h) => x > h.x0 - 1 && x < h.x1 + 1 && z > h.z0 - 1 && z < h.z1 + 1)) continue;
      groundDecal(b, rnd.f() < 0.5 ? 'crackLarge' : 'puddle', x, z, 2 + rnd.f() * 3, 2 + rnd.f() * 3, rnd.f() * 6);
    }
    // grass in the cracks along both edges
    const e = 1.6;
    if (alongX) {
      grass(c, { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0 + e, density: 0.5, seed: Math.round(r.z0 * 7) });
      grass(c, { x0: r.x0, z0: r.z1 - e, x1: r.x1, z1: r.z1, density: 0.5, seed: Math.round(r.z1 * 7) });
    } else {
      grass(c, { x0: r.x0, z0: r.z0, x1: r.x0 + e, z1: r.z1, density: 0.5, seed: Math.round(r.x0 * 7) });
      grass(c, { x0: r.x1 - e, z0: r.z0, x1: r.x1, z1: r.z1, density: 0.5, seed: Math.round(r.x1 * 7) });
    }
  }
  // wild cherry trees that have pushed up through Sakura-dori's median and the road edges
  const S = ROADS.sakura;
  for (let x = S.x0 + 14; x < S.x1 - 8; x += 17 + rnd.f() * 8) {
    if (Math.abs(x - -24) < 8 || Math.abs(x - 72) < 8) continue; // keep the junctions open
    const z = (S.z0 + S.z1) / 2 + (rnd.f() - 0.5) * 2;
    cherryTree(c, { x, z, scale: 0.9 + rnd.f() * 0.4, rot: rnd.f() * 6 });
    petals(b, { x, z, r: 3.2 });
  }

  // ---- street lights (mostly dead now), utility poles with sagging wires ----
  const lampAlong = (x0: number, z0: number, x1: number, z1: number, rot: number): void => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 6; s < L - 4; s += 22) {
      const t = s / L;
      const dead = rnd.f() < 0.7;
      streetLamp(b, { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, rot, style: 'cobra', on: !dead, mode: dead ? 'steady' : 'flicker', color: 0xffc890 });
    }
  };
  lampAlong(S.x0, S.z0 - 0.6, S.x1, S.z0 - 0.6, Math.PI);
  lampAlong(S.x0, S.z1 + 0.6, S.x1, S.z1 + 0.6, 0);
  const K = ROADS.kita;
  lampAlong(K.x0, K.z1 + 0.6, K.x1, K.z1 + 0.6, 0);
  const poles: { x: number; z: number }[] = [];
  for (let x = -120; x <= 120; x += 26) poles.push({ x, z: K.z0 - 0.8 });
  poles.forEach((p, i) => utilityPole(b, { x: p.x, z: p.z, rot: 0, wireTo: poles[i + 1] ? [poles[i + 1]!] : [], leaning: rnd.f() < 0.25 ? (rnd.f() - 0.5) * 0.3 : 0 }));
  // dead traffic lights at the junctions
  for (const [x, z] of [[-30, 7], [-18, 21], [66, 7], [78, -15], [-30, -15], [-18, -27]] as const) trafficLight(b, { x, z, rot: 0, mode: rnd.f() < 0.3 ? 'flash' : 'dead' });

  // ---- cars left where they stopped: rusted, grown over ----
  const cars: [number, number, number, string][] = [
    [-108, 14, 0.1, 'hatch'],
    [-86, 11, -0.2, 'sedan'],
    [-52, 17, 3.0, 'van'],
    [-6, 13, 0.4, 'sedan'],
    [18, 10, Math.PI + 0.3, 'hatch'],
    [44, 16, 0.05, 'suv'],
    [96, 12, -0.4, 'sedan'],
    [118, 17, 1.2, 'van'],
    [-24, -40, 1.5, 'sedan'],
    [-25, 40, 1.7, 'hatch'],
    [-22, 56, 1.4, 'van'],
    [72, -40, 1.6, 'boxTruck'],
    [-70, -21, 0.2, 'sedan'],
    [30, -22, 3.1, 'hatch'],
    [104, -20, 0.1, 'van'],
  ];
  for (const [x, z, rot, kind] of cars) vehicle(b, { x, z, rot, kind: kind as 'sedan', paint: (['white', 'grey', 'black', 'blue', 'red'] as const)[Math.floor(rnd.f() * 5)]!, wrecked: rnd.f() < 0.6, burnt: rnd.f() < 0.15, doorsOpen: rnd.f() < 0.4, seed: Math.round(x * 3 + z) });
  // a police roadblock that never held, at the avenue's west end
  cones(b, { x0: -126, z0: 9.5, x1: -126, z1: 18.5, spacing: 1.4 });
  roadSign(b, { x: -124, z: 7, rot: Math.PI / 2, lines: ['立入禁止', 'NO ENTRY'], kind: 'quarantine' });
  // vending machines on corners, long dead (one somehow still lit)
  vendingMachine(b, { x: -33, z: 21.5, rot: Math.PI, color: 'white', dead: true, seed: 1 });
  vendingMachine(b, { x: -31.8, z: 21.5, rot: Math.PI, color: 'red', dead: true, seed: 2 });
  vendingMachine(b, { x: 79, z: 6.5, rot: 0, color: 'blue', dead: false, seed: 3 });
  vendingMachine(b, { x: -17, z: -14.5, rot: 0, color: 'white', dead: true, tipped: true, seed: 4 });

  // the canal hole is open ground: debris along its banks
  debris(b, { x: 30, z: CANAL.z0 - 2, radius: 5, density: 0.5, seed: 3 });

  // ---- threat regions (first match wins) and the map's labels ----
  d.regionRects.push(
    { region: 'high', x0: ZONES.theatre.x0, z0: ZONES.theatre.z0, x1: ZONES.freight.x1, z1: ZONES.freight.z1 },
    { region: 'medium', x0: ZONES.shotengaiM.x0, z0: ZONES.shotengaiM.z0, x1: ZONES.shotengaiE.x1, z1: ZONES.shotengaiE.z1 },
    { region: 'medium', x0: ZONES.canal.x0, z0: ZONES.canal.z0, x1: ZONES.canal.x1, z1: ZONES.canal.z1 },
  );
  d.label('SAKURAGI STATION', -80, 44, 1);
  d.label('HILLTOP SCHOOL', -80, -46, 1);
  d.label('SHOTENGAI', 20, -4, 0.9);
  d.label('KAWABATA CANAL', 30, 33, 0.85);
  d.label('SHRINE', 100, 52, 0.9);
  d.label('CRIMSON THEATRE', 20, -48, 1);
  d.label('FREIGHT YARD', 102, -46, 0.9);
}
