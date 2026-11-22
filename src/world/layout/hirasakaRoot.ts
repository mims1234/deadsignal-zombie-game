/**
 * HIRASAKA: THE KOFUN PASSAGE AND THE ROOT HALL (place group 'root', the deep). The kofun passage's head (x 396..414,
 * y 9) opens east into the village by its door (x 414..420); the passage itself steps down west from y 9 to the Root
 * Hall at y 0 (x 344..396, z -40..-32). The Root Hall (x 268..344, z -68..-6, roof 24) is the deepest place. The climb
 * out: from the passage's head the adit stair steps up south (x 400..410, z -26..-10, to y 15), to the old adit's door
 * (ADIT.door, the frame's link back to the island).
 * Spots: DEEP_SPOTS tree / hairpin / kurogane / peaches / hoist / fanDuct / pump, OBSTACLES roots, ADIT head / door,
 * CLIMB_MARKS kofunHead.
 *
 * What stands here:
 *  - THE KOFUN PASSAGE: huge dry-laid stones in two courses along both walls, slab roof stones across, stone treads on
 *    every step, niches with clay haniwa and small lamps; at its head a trilithon gate with two haniwa guardians and the
 *    head chamber lined in the same stone;
 *  - THE ADIT STAIR: rough timber sets (posts and caps) every two metres up the steps, lagging boards behind them, plank
 *    nosings, a rope rail; grey daylight at the old adit's door;
 *  - THE ROOT HALL: the forked dead tree (bone-pale; `hirasakaDress.rootTree`, people by `look.ts`), ribs of root
 *    arching up every wall into the roof, a root arch round the passage's mouth, bones at the ribs' feet, flagstones,
 *    old rails and a tipped tub; one branch with a few peach blossoms (the only pink);
 *  - KUROGANE'S MACHINERY (static frames baked; the moving parts are named objects the bosses session drives, see
 *    `ROOT_MACHINES`): the hoist (a timber tower on the west wall, a winch, an overhead rail across the hall with three
 *    hanging ore skips), the ventilation fan in the north wall (its duct, housing and a rotor), the pit pump on the west
 *    wall and its fenced sump (the water surface a named object), and the roots over Mio's hairpin (named, to remove
 *    when the tachi cuts them).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';
import { H, block, box, cyl, solid } from './hirasakaKit';
import { crag, dressMats, gnarl, rootTree } from './hirasakaDress';
import { ADIT, DEEP_ROOMS, DEEP_SPOTS, DEEP_Y, slopeY, type DeepRoom } from '../../hirasaka/places';

export const ROOT_RECT = { x0: 266, z0: -70, x1: 420, z1: -4 };

/**
 * Kurogane's room-changers: where they are and the names of their moving parts (`scene.getObjectByName(name)`; each a
 * single mesh added with `b.addDynamic`, untouched by the bake). Everything else of them is baked and static.
 *  - hoist: the winch the player works stands at `winch`; the rail runs along z `rail.z` at height `rail.y` from
 *    `rail.x0` to `rail.x1`; the skips hang under it (`skips[i]`: the skip's centre; `bottom` its underside), each a
 *    mesh named `hs-hoist-skip-<i>` whose origin is its trolley on the rail (drop it by moving it down in y).
 *  - fan: the rotor `hs-fan-rotor` spins about z at `rotor`; the duct's mouth faces south (+z) into the hall.
 *  - pump: the pump machine at `machine`; the sump is the rect `sump` with its water `hs-sump-water` (a plane, top at
 *    `waterY` full; lower it to `dryY` as the pit is pumped dry).
 *  - roots: `hs-hairpin-roots`, the roots over Mio's hairpin (hide it when the tachi cuts them).
 */
export const ROOT_MACHINES = {
  hoist: {
    spot: DEEP_SPOTS.hoist,
    winch: { x: 284, y: 0, z: -16.4 },
    tower: { x0: 268, z0: -27, x1: 276, z1: -13, top: 9 },
    rail: { x0: 272, x1: 331, z: -23, y: 13 },
    skips: [
      { name: 'hs-hoist-skip-0', x: 292, y: 8.6, z: -23, bottom: 7.9 },
      { name: 'hs-hoist-skip-1', x: 306, y: 8.6, z: -23, bottom: 7.9 },
      { name: 'hs-hoist-skip-2', x: 320, y: 8.6, z: -23, bottom: 7.9 },
    ],
  },
  fan: { spot: DEEP_SPOTS.fanDuct, name: 'hs-fan-rotor', rotor: { x: 330, y: 4.8, z: -63.2 }, r: 3.4, duct: { x0: 324.6, z0: -68, x1: 335.4, z1: -63.6, top: 9.6 } },
  pump: { spot: DEEP_SPOTS.pump, machine: { x: 270.8, y: 0, z: -60 }, sump: { x0: 279, z0: -64, x1: 289, z1: -56 }, name: 'hs-sump-water', waterY: 0.55, dryY: 0.06 },
  roots: { spot: DEEP_SPOTS.hairpin, name: 'hs-hairpin-roots' },
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// materials (plain colours merge per finish; the lamps and the blossom glow)
// ---------------------------------------------------------------------------------------------------------------------

const std = (color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const R = {
  // bone glows faintly (violet-grey) so the tree and the ribs read through the deep's dark: one batch per chunk
  bone: new THREE.MeshStandardMaterial({ color: 0xc4b8a0, roughness: 0.95, emissive: 0x3a3450, emissiveIntensity: 0.7 }),
  boneDark: std(0x948a76, 0.95),
  bones: std(0xcfc3a8, 0.85),
  stone: std(0x4c4944, 0.95),
  stoneLight: std(0x625e57, 0.95),
  stoneDark: std(0x2e2c29, 0.95),
  clay: std(0x8c5a3a, 0.85),
  timber: std(0x3a2a1e, 0.85),
  plank: std(0x5a4430, 0.85),
  rope: std(0xa08a5a, 0.95),
  ink: std(0x0a0908, 0.95),
  water: new THREE.MeshStandardMaterial({ color: 0x12282a, roughness: 0.12, metalness: 0.3 }),
};

const P = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A straight rod from p to q (a chain, a strut, a rope). */
function rodGeo(p: THREE.Vector3, q: THREE.Vector3, r: number, seg = 6): THREE.BufferGeometry | null {
  const d = new THREE.Vector3().subVectors(q, p);
  const len = d.length();
  if (len < 0.01) return null;
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const m = new THREE.Matrix4().compose(p.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(m);
}
function rod(b: LevelBuilder, mat: THREE.Material, p: THREE.Vector3, q: THREE.Vector3, r: number, seg = 6): void {
  const g = rodGeo(p, q, r, seg);
  if (g) b.add(new THREE.Mesh(g, mat), { cast: false });
}

/** A box geometry placed and turned (for the merged moving parts). */
function boxGeo(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.applyMatrix4(new THREE.Matrix4().compose(P(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Several geometries as one (position and normal only), for a moving part that must stay one draw call. */
function merge(geos: (THREE.BufferGeometry | null)[]): THREE.BufferGeometry {
  const list = geos.filter((g): g is THREE.BufferGeometry => !!g).map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  return mergeGeometries(list, false)!;
}

/** A moving part: one mesh, named, added untouched (the bosses session finds it by name). */
function part(b: LevelBuilder, name: string, geo: THREE.BufferGeometry, mat: THREE.Material, at: THREE.Vector3): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.position.copy(at);
  m.castShadow = false;
  m.receiveShadow = true;
  b.addDynamic(m);
  return m;
}

const room = (id: string): DeepRoom => DEEP_ROOMS.find((r) => r.id === id)!;

// ---------------------------------------------------------------------------------------------------------------------
// the kofun passage, its head, and the adit stair
// ---------------------------------------------------------------------------------------------------------------------

/** Big dry-laid stones in two courses along a wall run (x from x0 to x1 at the wall line z, `into` toward the room). */
function stoneCourses(c: Ctx, x0: number, x1: number, z: number, into: number, floorAt: (x: number) => number, roofAt: (x: number) => number, seed: number, niches: number[] = []): void {
  const { b } = c;
  const r = rnd(seed);
  const depth = 0.9;
  const zc = z + into * (depth / 2);
  let x = x0;
  while (x < x1 - 0.2) {
    const len = Math.min(x1 - x, 1.9 + r() * 1.4);
    const mx = x + len / 2;
    const fy = floorAt(mx);
    const top = roofAt(mx) - 0.55;
    const niche = niches.some((n) => n >= x && n < x + len);
    const h1 = 1.7 + r() * 0.6;
    const mat = r() < 0.3 ? R.stoneLight : r() < 0.5 ? R.stoneDark : R.stone;
    if (niche) {
      // a niche: the lower course stepped back, a haniwa and a little clay lamp standing in it
      box(b, R.stoneDark, mx, fy + 0.35, zc - into * 0.2, len - 0.1, 0.7, depth - 0.4, 0, false);
      haniwa(b, mx, fy + 0.7, zc - into * 0.15, 0.7);
      box(b, R.clay, mx + 0.45, fy + 0.78, zc - into * 0.1, 0.18, 0.16, 0.18, 0, false);
      box(b, H.lamp, mx + 0.45, fy + 0.9, zc - into * 0.1, 0.08, 0.08, 0.08, 0, false);
    } else {
      box(b, mat, mx, fy - 0.3 + (h1 + 0.3) / 2, zc, len - 0.08, h1 + 0.3, depth + (r() - 0.5) * 0.2, (r() - 0.5) * 0.06, false);
    }
    // the upper course leans in a little (corbelled), up to the roof slabs
    const h2 = top - (fy + h1);
    if (h2 > 0.3) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, h2, depth * 0.9), r() < 0.5 ? R.stone : R.stoneLight);
      s.position.set(mx, fy + h1 + h2 / 2 + 0.02, zc + into * 0.12);
      s.rotation.set(into * 0.06, (r() - 0.5) * 0.05, 0);
      s.updateMatrixWorld(true);
      b.add(s, { cast: false });
    }
    solid(c, mx, zc, len, depth, top + 0.4, 'kofun-stone');
    x += len;
  }
}

/** A clay haniwa figure (a cylinder body, arms, a hollow-eyed face), `s` its scale, standing at y. */
function haniwa(b: LevelBuilder, x: number, y: number, z: number, s: number): void {
  cyl(b, R.clay, x, y, z, 0.17 * s, 0.22 * s, 0.9 * s, 10, false);
  cyl(b, R.clay, x, y + 0.9 * s, z, 0.13 * s, 0.15 * s, 0.32 * s, 10, false);
  for (const d of [-1, 1]) box(b, R.clay, x + d * 0.23 * s, y + 0.62 * s, z, 0.08 * s, 0.34 * s, 0.08 * s, d * 0.5, false);
  for (const d of [-1, 1]) box(b, R.ink, x + d * 0.05 * s, y + 1.08 * s, z + 0.135 * s, 0.05 * s, 0.035 * s, 0.03 * s, 0, false);
  box(b, R.ink, x, y + 0.98 * s, z + 0.14 * s, 0.07 * s, 0.03 * s, 0.03 * s, 0, false);
}

function buildKofun(c: Ctx): void {
  const { b } = c;
  const k = room('kofun');
  const fy = (x: number): number => slopeY(k, Math.min(k.x1 - 0.01, Math.max(k.x0, x)), (k.z0 + k.z1) / 2);
  const roof = (x: number): number => fy(x) + k.h;
  // the two walls of stone, with niches
  stoneCourses(c, k.x0, k.x1, k.z0, 1, fy, roof, 6101, [352, 378]);
  stoneCourses(c, k.x0, k.x1, k.z1, -1, fy, roof, 6102, [365, 390]);
  // roof slabs across, each sat a little crooked
  const r = rnd(6103);
  for (let x = k.x0 + 1.2; x < k.x1; x += 2.5 + r() * 0.4) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, k.z1 - k.z0 + 0.2), r() < 0.5 ? R.stone : R.stoneDark);
    s.position.set(x, roof(x) - 0.3, (k.z0 + k.z1) / 2);
    s.rotation.set((r() - 0.5) * 0.04, (r() - 0.5) * 0.06, (r() - 0.5) * 0.08);
    s.updateMatrixWorld(true);
    b.add(s, { cast: false });
  }
  // a stone tread on every step, split into two or three slabs
  const n = Math.round((k.slope!.y2 - k.y) / 0.3);
  const tread = (k.x1 - k.x0) / n;
  for (let i = 0; i < n; i++) {
    const x = k.x0 + (i + 0.5) * tread;
    const top = fy(x);
    let z = k.z0 + 0.9;
    while (z < k.z1 - 1) {
      const w = Math.min(k.z1 - 0.9 - z, 1.6 + r() * 1.6);
      box(b, r() < 0.4 ? R.stoneLight : R.stone, x, top + 0.03, z + w / 2, tread - 0.08, 0.06, w - 0.06, 0, false);
      z += w;
    }
    if (r() < 0.35) box(b, R.stoneDark, x + (r() - 0.5) * tread * 0.5, top + 0.1, k.z0 + 1.2 + r() * 5.6, 0.3, 0.16, 0.24, r() * 3, false);
  }
  // lamps in the niches
  for (const [x, z] of [[352, k.z0 + 0.8], [365, k.z1 - 0.8], [378, k.z0 + 0.8], [390, k.z1 - 0.8]] as const) b.light({ x, y: fy(x) + 1.4, z, color: 0xff7a40, intensity: 24, distance: 12, mode: 'flicker', glow: 0.25, tag: 'kofun' });
}

/** The passage's head: the chamber lined in the same stone, the trilithon gate at the passage's mouth, its guardians. */
function buildKofunHead(c: Ctx): void {
  const { b } = c;
  const hd = room('kofunHead');
  const y = hd.y;
  const flat = (): number => y;
  const roofAt = (): number => y + hd.h;
  // lining: the north wall whole, and the stubs of the west, east and south walls either side of the openings
  stoneCourses(c, hd.x0 + 0.9, hd.x1 - 0.9, hd.z0, 1, flat, roofAt, 6201);
  stoneCourses(c, hd.x0 + 0.9, 400, hd.z1, -1, flat, roofAt, 6202);
  stoneCourses(c, 410, hd.x1 - 0.9, hd.z1, -1, flat, roofAt, 6203);
  // west wall stubs (along z: build as x-runs turned, simplest as blocks)
  const r = rnd(6204);
  for (const [z0, z1] of [[hd.z0, -40], [-32, hd.z1]] as const) {
    for (const x of [hd.x0 + 0.45, hd.x1 - 0.45]) {
      let z = z0;
      while (z < z1 - 0.1) {
        const len = Math.min(z1 - z, 1.8 + r() * 1.2);
        box(b, r() < 0.4 ? R.stoneLight : R.stone, x, y + (hd.h - 0.6) / 2, z + len / 2, 0.9, hd.h - 0.6, len - 0.08, (r() - 0.5) * 0.05, false);
        z += len;
      }
      solid(c, x, (z0 + z1) / 2, 0.9, z1 - z0, y + hd.h, 'kofun-stone');
    }
  }
  // the trilithon at the passage's mouth: two great uprights and a lintel
  for (const z of [-40.6, -31.4]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.6, 1.2), R.stoneLight);
    s.position.set(396.9, y + 2.3, z);
    s.rotation.set(0, 0, z < -36 ? 0.03 : -0.02);
    s.updateMatrixWorld(true);
    b.add(s, { cast: false });
    solid(c, 396.9, z, 1.4, 1.2, y + 4.6, 'kofun-gate');
  }
  box(b, R.stone, 396.9, y + 4.95, -36, 1.8, 0.8, 10.6, 0, false);
  // the guardians: two warrior haniwa either side of the gate, and a straw rope across it with shide
  haniwa(b, 398.6, y, -42.2, 1.6);
  haniwa(b, 398.6, y, -29.8, 1.6);
  for (const z of [-42.2, -29.8]) solid(c, 398.6, z, 0.8, 0.8, y + 2, 'haniwa', { shots: false });
  for (let i = 0; i < 6; i++) {
    const t0 = i / 6;
    const t1 = (i + 1) / 6;
    const sag = (t: number): number => Math.sin(t * Math.PI) * 0.35;
    rod(b, R.rope, P(397.7, y + 4.1 - sag(t0), -40 + t0 * 8), P(397.7, y + 4.1 - sag(t1), -40 + t1 * 8), 0.06);
    if (i > 0) for (let s = 0; s < 3; s++) box(b, H.white, 397.7, y + 3.95 - sag(t0) - s * 0.15, -40 + t0 * 8 + (s % 2) * 0.05, 0.02, 0.14, 0.11, 0, false);
  }
  // stones fallen from the lining
  for (let i = 0; i < 5; i++) box(b, R.stoneDark, hd.x0 + 3 + r() * 12, y + 0.18, hd.z0 + 1.6 + r() * 2, 0.6 + r() * 0.5, 0.36, 0.5, r() * 3, false);
  b.light({ x: 403, y: y + 4, z: -36, color: 0xff8a50, intensity: 18, distance: 14, mode: 'flicker', glow: 0.2, tag: 'kofun-head' });
}

function buildAditStair(c: Ctx): void {
  const { b } = c;
  const st = room('aditStair');
  const fy = (z: number): number => slopeY(st, (st.x0 + st.x1) / 2, Math.min(st.z1 - 0.01, Math.max(st.z0, z)));
  // timber sets every two metres: two posts and a cap, lagging boards behind the posts
  for (let z = st.z0 + 1; z < st.z1; z += 2) {
    const y = fy(z);
    const top = y + 4.2;
    for (const x of [st.x0 + 0.35, st.x1 - 0.35]) {
      box(b, R.timber, x, (y + top) / 2, z, 0.3, top - y, 0.3, 0, false);
      solid(c, x, z, 0.32, 0.32, top, 'adit-set', { surface: 'wood' });
    }
    box(b, R.timber, (st.x0 + st.x1) / 2, top + 0.15, z, st.x1 - st.x0, 0.32, 0.34, 0, false);
    for (const x of [st.x0 + 0.12, st.x1 - 0.12]) for (let k = 0; k < 4; k++) box(b, R.plank, x, y + 0.6 + k * 0.95, z + 1, 0.06, 0.25, 2, 0, false);
    // roof lagging over the cap
    for (let k = 0; k < 5; k++) box(b, R.plank, st.x0 + 1 + k * 2, top + 0.36, z + 1, 1.6, 0.06, 2, 0, false);
  }
  // plank nosings on the steps, a rope rail along the east posts
  const n = Math.round((st.slope!.y2 - st.y) / 0.3);
  const tread = (st.z1 - st.z0) / n;
  for (let i = 0; i < n; i++) {
    const z = st.z0 + (i + 0.5) * tread;
    box(b, R.plank, (st.x0 + st.x1) / 2, fy(z) + 0.025, z - tread / 2 + 0.12, st.x1 - st.x0 - 1, 0.05, 0.22, 0, false);
  }
  rod(b, R.rope, P(st.x1 - 0.5, fy(st.z0) + 1.1, st.z0 + 1), P(st.x1 - 0.5, fy(st.z1 - 0.1) + 1.1, st.z1 - 1), 0.04);
  b.light({ x: 405, y: fy(-18) + 3.4, z: -18, color: 0xffb070, intensity: 12, distance: 10, mode: 'flicker', glow: 0.25, tag: 'adit-stair' });
  box(b, H.lamp, 409.4, fy(-18) + 3.3, -18, 0.18, 0.24, 0.18, 0, false);
  // the old adit's door at the head of the climb: a timber portal, the plank door, grey daylight round its edges
  const hd = ADIT.head;
  for (const s of [-1, 1]) box(b, R.timber, hd.x + s * 2, hd.y + 1.8, -4.4, 0.36, 3.6, 0.36, 0, false);
  box(b, R.timber, hd.x, hd.y + 3.7, -4.4, 4.6, 0.4, 0.4, 0, false);
  box(b, H.woodDark, hd.x, hd.y + 1.5, -4.2, 3.4, 3, 0.3, 0, false);
  for (const dx of [-1.2, -0.4, 0.4, 1.2]) box(b, R.plank, hd.x + dx, hd.y + 1.5, -4.36, 0.7, 2.9, 0.04, 0, false);
  box(b, H.iron, hd.x, hd.y + 2.2, -4.42, 3.2, 0.12, 0.04, 0, false);
  box(b, H.iron, hd.x, hd.y + 0.8, -4.42, 3.2, 0.12, 0.04, 0, false);
  b.light({ x: hd.x, y: hd.y + 2.6, z: -6, color: 0xa8c0d8, intensity: 40, distance: 12, mode: 'steady', glow: 0.6, tag: 'adit' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the Root Hall
// ---------------------------------------------------------------------------------------------------------------------

const TREE = DEEP_SPOTS.tree;

/** A rib of root up a wall and over into the roof: from its foot on the floor toward the tree, high. */
function rib(c: Ctx, footX: number, footZ: number, wallX: number, wallZ: number, seed: number): void {
  const { b } = c;
  const r = rnd(seed);
  const toward = (t: number, y: number): THREE.Vector3 => P(wallX + (TREE.x - wallX) * t + (r() - 0.5) * 0.8, y, wallZ + (TREE.z - wallZ) * t + (r() - 0.5) * 0.8);
  const pts = [P(footX, -0.3, footZ), P((footX * 2 + wallX) / 3, 3.5, (footZ * 2 + wallZ) / 3), toward(0.02, 9 + r() * 2), toward(0.08, 16 + r() * 2), toward(0.22, 21.5), toward(0.4, 23.8)];
  b.add(new THREE.Mesh(gnarl(pts, 1.1 + r() * 0.3, 0.4, seed, { radial: 9, ridges: 0.2 }), R.bone), { cast: false });
  // a lesser root forking off low, back down to the floor
  const side = r() < 0.5 ? -1 : 1;
  const nx = wallZ !== footZ ? 1 : 0;
  const nz = wallX !== footX ? 1 : 0;
  const fx = footX + side * nx * 2.6;
  const fz = footZ + side * nz * 2.6;
  b.add(new THREE.Mesh(gnarl([pts[1]!, P((pts[1]!.x + fx) / 2, 2.6, (pts[1]!.z + fz) / 2), P(fx, -0.2, fz)], 0.5, 0.18, seed + 1, { radial: 7 }), R.boneDark), { cast: false });
  solid(c, footX, footZ, 2.2, 2.2, 3.4, 'root-rib', { surface: 'wood' });
  // bones gathered at its foot
  bones(b, footX + (TREE.x - footX) * 0.08, footZ + (TREE.z - footZ) * 0.08, seed + 7);
}

/** A few bones where the roots drew them in: long bones crossed, a skull or two, half sunk in the floor. */
function bones(b: LevelBuilder, x: number, z: number, seed: number): void {
  const r = rnd(seed);
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI;
    const l = 0.35 + r() * 0.2;
    const cx = x + (r() - 0.5) * 1.4;
    const cz = z + (r() - 0.5) * 1.4;
    rod(b, R.bones, P(cx - Math.cos(a) * l, 0.05, cz - Math.sin(a) * l), P(cx + Math.cos(a) * l, 0.07, cz + Math.sin(a) * l), 0.035, 5);
  }
  for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), R.bones);
    s.scale.set(1, 0.9, 1.15);
    s.position.set(x + (r() - 0.5) * 1.2, 0.08, z + (r() - 0.5) * 1.2);
    s.updateMatrixWorld(true);
    b.add(s, { cast: false });
  }
}

/** The hoist: the timber tower on the west wall and its ledge, the winch, the rail across the hall, the three skips. */
function hoist(c: Ctx): void {
  const { b } = c;
  const H0 = ROOT_MACHINES.hoist;
  const T = H0.tower;
  // the tower: four great posts, braces, a plank ledge at y 8 with a rail, an ore bin on it
  for (const x of [T.x0 + 0.5, T.x1 - 0.4]) for (const z of [T.z0 + 0.4, T.z1 - 0.4]) box(b, R.timber, x, 6.8, z, 0.5, 13.6, 0.5, 0, false);
  for (const z of [T.z0 + 0.4, T.z1 - 0.4]) {
    rod(b, R.timber, P(T.x1 - 0.4, 0.3, z), P(T.x0 + 0.5, 7.6, z), 0.14);
    rod(b, R.timber, P(T.x0 + 0.5, 0.3, z), P(T.x1 - 0.4, 7.6, z), 0.14);
  }
  for (const zz of [T.z0 + 1.5, (T.z0 + T.z1) / 2, T.z1 - 1.5]) rod(b, R.timber, P(T.x1 - 0.4, 0.3, zz - 1), P(T.x1 - 0.4, 7.6, zz + 1), 0.12);
  box(b, R.plank, (T.x0 + T.x1) / 2, 8, (T.z0 + T.z1) / 2, T.x1 - T.x0, 0.2, T.z1 - T.z0, 0, false);
  box(b, R.timber, T.x1 - 0.3, 9, (T.z0 + T.z1) / 2, 0.12, 0.1, T.z1 - T.z0, 0, false);
  for (let z = T.z0 + 0.5; z < T.z1; z += 1.6) box(b, R.timber, T.x1 - 0.3, 8.5, z, 0.1, 1, 0.1, 0, false);
  box(b, H.rustDark, T.x0 + 2.4, 9.1, T.z0 + 3, 3, 2, 3, 0, false);
  solid(c, (T.x0 + T.x1) / 2, (T.z0 + T.z1) / 2, T.x1 - T.x0, T.z1 - T.z0, T.top + 1, 'hoist-tower', { surface: 'wood' });
  // the rail: an iron girder from the tower over the hall, held on a trestle and on chains into the roof
  const rl = H0.rail;
  box(b, H.iron, (rl.x0 + rl.x1) / 2, rl.y, rl.z, rl.x1 - rl.x0, 0.5, 0.18, 0, false);
  box(b, H.iron, (rl.x0 + rl.x1) / 2, rl.y + 0.25, rl.z, rl.x1 - rl.x0, 0.06, 0.5, 0, false);
  box(b, H.iron, (rl.x0 + rl.x1) / 2, rl.y - 0.25, rl.z, rl.x1 - rl.x0, 0.06, 0.5, 0, false);
  // hung from the roof on paired iron rods with a cross-head where each meets the girder (the arena stays open)
  for (const x of [289, 302, 315, 328]) {
    box(b, H.iron, x, rl.y + 0.35, rl.z, 0.4, 0.2, 1.6, 0, false);
    for (const dz of [-0.7, 0.7]) rod(b, H.iron, P(x, rl.y + 0.4, rl.z + dz), P(x + 0.4, 24, rl.z + dz * 3), 0.07, 5);
  }
  // the winch: a drum on an iron frame, the crank and brake lever, the cable up to the rail's head
  const w = H0.winch;
  block(c, H.iron, w.x, 0, w.z, 2.6, 0.5, 1.4, 'hoist-winch');
  for (const s of [-1, 1]) box(b, H.iron, w.x + s * 1.1, 1.0, w.z, 0.16, 1.2, 1.2, 0, false);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 14).rotateZ(Math.PI / 2), H.rust);
  drum.position.set(w.x, 1.3, w.z);
  drum.updateMatrixWorld(true);
  b.add(drum, { cast: false });
  rod(b, H.steel, P(w.x + 1.3, 1.3, w.z), P(w.x + 1.6, 1.7, w.z - 0.6), 0.05);
  rod(b, H.steel, P(w.x - 1.3, 0.5, w.z - 0.5), P(w.x - 1.3, 1.8, w.z - 0.9), 0.04);
  solid(c, w.x, w.z, 2.6, 1.4, 1.9, 'hoist-winch', { surface: 'metal' });
  rod(b, H.steel, P(w.x, 1.8, w.z), P(rl.x0 + 4, rl.y - 0.3, rl.z), 0.03, 4);
  box(b, H.lamp, w.x - 1.6, 1.6, w.z + 0.2, 0.2, 0.26, 0.2, 0, false);
  b.light({ x: w.x - 1, y: 3, z: w.z - 2, color: 0xffa060, intensity: 16, distance: 10, mode: 'flicker', glow: 0.3, tag: 'hoist' });
  // the skips: each a trolley on the rail, its chains, the iron skip heaped with ore; one mesh each, named
  for (const s of H0.skips) {
    const top = rl.y - 0.3;
    const g = merge([
      boxGeo(0, 0, 0, 0.9, 0.36, 0.7),
      rodGeo(P(-0.3, -0.1, 0), P(-0.55, -(top - s.y) + 0.55, 0.45), 0.035, 4),
      rodGeo(P(0.3, -0.1, 0), P(0.55, -(top - s.y) + 0.55, 0.45), 0.035, 4),
      rodGeo(P(-0.3, -0.1, 0), P(-0.55, -(top - s.y) + 0.55, -0.45), 0.035, 4),
      rodGeo(P(0.3, -0.1, 0), P(0.55, -(top - s.y) + 0.55, -0.45), 0.035, 4),
      boxGeo(0, -(top - s.y), 0, 1.7, 1.2, 1.3),
      boxGeo(0, -(top - s.y) + 0.7, 0, 1.4, 0.4, 1.0, 0.1, 0, 0.08),
      boxGeo(0, -(top - s.y) + 0.62, 0, 1.9, 0.12, 0.12),
    ]);
    part(b, s.name, g, H.rustDark, P(s.x, top, s.z));
  }
}

/** The ventilation fan in the north wall: the duct out of the rock, the ring housing, the rotor (named), a grille. */
function fan(c: Ctx): void {
  const { b } = c;
  const F = ROOT_MACHINES.fan;
  const d = F.duct;
  const cx = (d.x0 + d.x1) / 2;
  // the duct: a riveted steel box out of the wall, ribbed, and its pipe running up the wall into the roof
  box(b, H.rustDark, cx, d.top / 2, (d.z0 + d.z1) / 2, d.x1 - d.x0, d.top, d.z1 - d.z0, 0, false);
  for (let k = 0; k < 4; k++) box(b, H.rust, cx, d.top / 2, d.z0 + 0.8 + k * 1.1, d.x1 - d.x0 + 0.2, d.top + 0.2, 0.16, 0, false);
  box(b, H.rustDark, cx, d.top + 7, d.z0 + 1.4, 5, 14, 2.6, 0, false);
  // the housing: an iron ring on the duct's face, a dark throat behind the rotor
  const ring = new THREE.Mesh(new THREE.TorusGeometry(F.r + 0.25, 0.32, 8, 32), H.iron);
  ring.position.set(F.rotor.x, F.rotor.y, d.z1 + 0.05);
  ring.updateMatrixWorld(true);
  b.add(ring, { cast: false });
  const throat = new THREE.Mesh(new THREE.CircleGeometry(F.r + 0.1, 28), R.ink);
  throat.position.set(F.rotor.x, F.rotor.y, d.z1 + 0.01);
  throat.updateMatrixWorld(true);
  b.add(throat, { cast: false });
  // the grille: four bars across the mouth (the rotor turns behind them)
  for (const dy of [-1.8, -0.6, 0.6, 1.8]) box(b, H.iron, F.rotor.x, F.rotor.y + dy, d.z1 + 0.95, 2 * Math.sqrt(Math.max(0, (F.r + 0.2) ** 2 - dy * dy)), 0.1, 0.1, 0, false);
  solid(c, cx, (d.z0 + d.z1) / 2 + 0.55, d.x1 - d.x0, d.z1 - d.z0 + 1.1, d.top + 0.3, 'fan-duct', { surface: 'metal' });
  // the rotor: a hub and eight blades, one mesh named for the bosses session to turn
  const blades: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.5, 0.5, 0.5, 12).rotateX(Math.PI / 2)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    blades.push(boxGeo(Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0, 2.9, 0.75, 0.08, 0.35, 0, a));
  }
  part(b, F.name, merge(blades), H.steel, P(F.rotor.x, F.rotor.y, F.rotor.z));
  // its starter: a switch box on a post by the duct
  block(c, H.iron, d.x1 + 1.2, 0, d.z1 + 0.6, 0.6, 1.4, 0.4, 'fan-switch', { shots: false });
  box(b, H.red, d.x1 + 1.2, 1.25, d.z1 + 0.82, 0.14, 0.14, 0.06, 0, false);
  b.light({ x: F.rotor.x, y: F.rotor.y + 1, z: d.z1 + 3, color: 0x8aa0c8, intensity: 34, distance: 16, mode: 'steady', glow: 0.3, tag: 'fan' });
  box(b, H.lamp, F.rotor.x, d.top + 0.3, d.z1 + 0.3, 0.3, 0.3, 0.3, 0, false);
}

/** The pit pump on the west wall and its fenced sump: the pump body, flywheel and motor, pipes, the water (named). */
function pump(c: Ctx): void {
  const { b } = c;
  const P0 = ROOT_MACHINES.pump;
  const m = P0.machine;
  // the machine: a bed of iron, the pump barrel, a flywheel, the motor housing, the stand pipe up into the wall
  block(c, H.iron, m.x, 0, m.z, 5.6, 0.6, 4, 'pit-pump');
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3, 14).rotateX(Math.PI / 2), H.rust);
  barrel.position.set(m.x + 0.6, 1.5, m.z);
  barrel.updateMatrixWorld(true);
  b.add(barrel, { cast: false });
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 20), H.iron);
  wheel.position.set(m.x - 1.4, 1.8, m.z - 1.6);
  wheel.updateMatrixWorld(true);
  b.add(wheel, { cast: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    rod(b, H.iron, P(m.x - 1.4 - Math.cos(a) * 1.05, 1.8 - Math.sin(a) * 1.05, m.z - 1.6), P(m.x - 1.4 + Math.cos(a) * 1.05, 1.8 + Math.sin(a) * 1.05, m.z - 1.6), 0.06, 4);
  }
  box(b, H.rustDark, m.x - 1.4, 1.4, m.z + 0.8, 1.8, 1.6, 1.6, 0, false);
  rod(b, H.rust, P(m.x - 2.4, 1.6, m.z), P(m.x - 2.4, 12, m.z), 0.35, 10);
  solid(c, m.x, m.z, 5.6, 4, 3, 'pit-pump', { surface: 'metal' });
  // the suction pipe from the sump over the floor to the pump (raised on stands, walked under)
  const sp = P0.sump;
  rod(b, H.rust, P(m.x + 2.2, 1.5, m.z), P(sp.x0 + 1, 2.8, m.z), 0.3, 10);
  rod(b, H.rust, P(sp.x0 + 1, 2.8, m.z), P(sp.x0 + 1.4, 0.5, (sp.z0 + sp.z1) / 2), 0.3, 10);
  // the sump: a kerb of stone, a dark pit, an iron rail round it on posts with two lamps; the water a named plane
  const scx = (sp.x0 + sp.x1) / 2;
  const scz = (sp.z0 + sp.z1) / 2;
  const sw = sp.x1 - sp.x0;
  const sd = sp.z1 - sp.z0;
  for (const [x, z, w, d] of [[scx, sp.z0, sw, 0.5], [scx, sp.z1, sw, 0.5], [sp.x0, scz, 0.5, sd], [sp.x1, scz, 0.5, sd]] as const) box(b, R.stoneLight, x, 0.35, z, w, 0.7, d, 0, false);
  box(b, R.ink, scx, 0.03, scz, sw - 0.5, 0.04, sd - 0.5, 0, false);
  for (let x = sp.x0; x <= sp.x1 + 0.01; x += sw / 4) for (const z of [sp.z0, sp.z1]) box(b, H.iron, x, 1.05, z, 0.1, 0.7, 0.1, 0, false);
  for (let z = sp.z0; z <= sp.z1 + 0.01; z += sd / 3) for (const x of [sp.x0, sp.x1]) box(b, H.iron, x, 1.05, z, 0.1, 0.7, 0.1, 0, false);
  box(b, H.iron, scx, 1.4, sp.z0, sw, 0.08, 0.08, 0, false);
  box(b, H.iron, scx, 1.4, sp.z1, sw, 0.08, 0.08, 0, false);
  box(b, H.iron, sp.x0, 1.4, scz, 0.08, 0.08, sd, 0, false);
  box(b, H.iron, sp.x1, 1.4, scz, 0.08, 0.08, sd, 0, false);
  for (const [x, z] of [[sp.x0, sp.z1], [sp.x1, sp.z1]] as const) box(b, H.lamp, x, 1.62, z, 0.2, 0.26, 0.2, 0, false);
  solid(c, scx, scz, sw + 0.5, sd + 0.5, 1.45, 'sump', { shots: false, surface: 'concrete' });
  part(b, P0.name, new THREE.PlaneGeometry(sw - 0.5, sd - 0.5).rotateX(-Math.PI / 2), R.water, P(scx, P0.waterY, scz));
  b.light({ x: scx, y: 2.6, z: sp.z1 + 1, color: 0xffa060, intensity: 16, distance: 11, mode: 'flicker', glow: 0.3, tag: 'pump' });
}

/** The roots over Mio's hairpin: four arched over it, one mesh (named, hidden when the tachi cuts them). */
function hairpinRoots(b: LevelBuilder): void {
  const h = DEEP_SPOTS.hairpin;
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    const dx = Math.cos(a) * 1.3;
    const dz = Math.sin(a) * 1.3;
    geos.push(gnarl([P(-dx, -0.2, -dz), P(-dx * 0.5, 0.75, -dz * 0.5), P(dx * 0.4, 0.95, dz * 0.4), P(dx, -0.2, dz)], 0.2, 0.12, 6400 + i, { radial: 7, segs: 16 }));
  }
  part(b, ROOT_MACHINES.roots.name, merge(geos), R.bone, P(h.x, h.y, h.z));
}

function buildHall(c: Ctx): void {
  const { b } = c;
  const D = dressMats(c.mats);
  const T = TREE;
  // the tree, bone-pale (never cut)
  rootTree(b, { ...D, bark: R.bone });
  b.collide({ x: T.x, z: T.z, hx: 3.2, hz: 3.2, y1: 18, mapKind: 'prop', surface: 'wood', tag: 'root-tree' });
  // the one living branch: a bough reaching up east with a few peach blossoms (the only pink down here)
  const tip = P(T.x + 7.5, 19.5, T.z - 3.5);
  b.add(new THREE.Mesh(gnarl([P(T.x + 1.2, 13, T.z - 0.6), P(T.x + 3.8, 16.2, T.z - 1.6), P(T.x + 6, 18.4, T.z - 2.8), tip], 0.55, 0.12, 6301, { radial: 8 }), R.bone), { cast: false });
  const br = rnd(6302);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + br() * 0.12, 0), H.peach);
    const t = 0.55 + br() * 0.45;
    m.position.set(T.x + 1.2 + (tip.x - T.x - 1.2) * t + (br() - 0.5) * 0.8, 13 + (tip.y - 13) * t + 0.3 + br() * 0.4, T.z - 0.6 + (tip.z - T.z + 0.6) * t + (br() - 0.5) * 0.8);
    m.updateMatrixWorld(true);
    b.add(m, { cast: false });
  }
  // ribs of root up every wall into the roof (clear of the machinery, the passage's mouth and the corners)
  const ribs: [number, number, number, number][] = [
    [292, -65, 292, -68], [305, -65, 305, -68], [318, -65, 318, -68],
    [290, -9, 290, -6], [304, -9, 304, -6], [320, -9, 320, -6], [333, -9, 333, -6],
    [271, -36, 268, -36], [271, -47, 268, -47],
    [341, -18, 344, -18], [341, -52, 344, -52],
  ];
  ribs.forEach(([fx, fz, wx, wz], i) => rib(c, fx, fz, wx, wz, 6500 + i * 11));
  // the root arch round the passage's mouth
  b.add(new THREE.Mesh(gnarl([P(342.2, -0.3, -42.2), P(342.6, 3.4, -41), P(343, 6.4, -36), P(342.6, 3.4, -31), P(342.2, -0.3, -29.8)], 0.8, 0.8, 6601, { radial: 9, segs: 30, ridges: 0.2 }), R.bone), { cast: false });
  for (const z of [-42.2, -29.8]) solid(c, 342.2, z, 1.6, 1.6, 3, 'root-arch', { surface: 'wood' });
  // flagstones under the roots, and the old mine's leavings by the west wall: rails and a tipped tub
  const r = rnd(6602);
  for (let i = 0; i < 70; i++) {
    const x = 274 + r() * 64;
    const z = -64 + r() * 54;
    if (Math.hypot(x - T.x, z - T.z) < 5) continue;
    box(b, r() < 0.5 ? R.stone : R.stoneDark, x, 0.03, z, 0.9 + r() * 0.9, 0.05, 0.7 + r() * 0.7, r() * 3, false);
  }
  for (const dx of [-0.55, 0.55]) box(b, H.iron, 276 + dx, 0.05, -40, 0.08, 0.1, 24, 0, false);
  for (let z = -51; z < -28; z += 0.9) box(b, R.timber, 276, 0.03, z, 1.6, 0.06, 0.2, 0, false);
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.8), H.rust);
  tub.position.set(278.2, 0.5, -44);
  tub.rotation.set(0, 0.2, 1.2);
  tub.updateMatrixWorld(true);
  b.add(tub, { cast: false });
  solid(c, 278.2, -44, 1.6, 2, 1.1, 'tub', { shots: false });
  // rock spilled from the walls at the corners
  for (const [x, z, sx, sz, seed] of [[343, -64, 1.6, 3.5, 6610], [269, -11, 1.6, 3, 6611], [341, -7, 3, 1.4, 6612]] as const) {
    crag(b, D.rock, { x, y: 1.4, z, sx, sy: 2.4, sz, seed, detail: 1, tone: [0.05, 0.048, 0.05] });
  }
  hoist(c);
  fan(c);
  pump(c);
  hairpinRoots(b);
  // the light: violet down from the roof over the tree, pale bone light low across the floor, the hairpin's red
  b.light({ x: T.x + 2, y: 21, z: T.z, color: 0x7a5cc8, intensity: 160, distance: 50, mode: 'steady', glow: 0.5, tag: 'roothall-sky' });
  b.light({ x: 322, y: 5, z: -44, color: 0xb0a8c8, intensity: 45, distance: 26, mode: 'pulse', period: 7, tag: 'roothall' });
  b.light({ x: 290, y: 5, z: -30, color: 0xb0a8c8, intensity: 40, distance: 24, mode: 'pulse', period: 9, tag: 'roothall' });
  b.light({ x: DEEP_SPOTS.hairpin.x, y: 1.4, z: DEEP_SPOTS.hairpin.z, color: 0xff3048, intensity: 8, distance: 6, mode: 'pulse', period: 2, glow: 0.4, tag: 'hairpin' });
}

export function buildRoot(c: Ctx): void {
  buildHall(c);
  buildKofun(c);
  buildKofunHead(c);
  buildAditStair(c);
  void DEEP_Y;
}
