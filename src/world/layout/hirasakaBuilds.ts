/**
 * HIRASAKA's built things, drawn in full (`hirasaka.ts` keeps what stops anyone and calls these for the look): the
 * mine's headframe and its winding wheels, the summit's shrine, torii, komainu, water pavilion and ema rack, Block 65's
 * outside fire stair, the open shops of Market Lane, and the schoolyard's and the block roof's bits of life.
 *
 * Everything here is static (baked into the level's batches). Colliders are added only where noted, from y 0 up, as the
 * island's single-height nav grid needs.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { MatRef } from '../structures';
import { MAT, bicycle } from './sakura/props';

type P3 = readonly [number, number, number];
const V = (p: P3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** A plain material of this module's own (shared by key). */
function own(key: string, color: number, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
    cache.set(key, m);
  }
  return m;
}
const R = (b: LevelBuilder, m: MatRef): THREE.Material => (typeof m === 'string' ? b.mats.get(m) : m);

function put(b: LevelBuilder, geo: THREE.BufferGeometry, m: MatRef, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(geo, R(b, m));
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  b.add(o, { cast });
  return o;
}
const box = (b: LevelBuilder, m: MatRef, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, cast = true): THREE.Mesh => put(b, new THREE.BoxGeometry(w, h, d), m, x, y, z, 0, ry, 0, cast);

/** A beam from a to e: `w` deep (in the plane the beam turns in), `h` thick. */
function beam(b: LevelBuilder, m: MatRef, a: P3, e: P3, w: number, h = w, cast = true): void {
  const A = V(a);
  const d = V(e).sub(A);
  const L = d.length();
  if (L < 1e-3) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, L, h), R(b, m));
  o.position.copy(A).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(o, { cast });
}

/** A rope or cable through points (a smooth tube). */
function rope(b: LevelBuilder, m: MatRef, pts: readonly P3[], r: number, segs = 24): void {
  const curve = new THREE.CatmullRomCurve3(pts.map(V));
  b.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 6, false), R(b, m)), { cast: false });
}

/** A sagging line from a to e (a cable between two points), `sag` metres at its middle. */
function sagging(a: P3, e: P3, sag: number, n = 8): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([lerp(a[0], e[0], t), lerp(a[1], e[1], t) - sag * 4 * t * (1 - t), lerp(a[2], e[2], t)]);
  }
  return out;
}

/**
 * A curved gable roof, its ridge along x: `w` long, from eave to eave `2 * half` across z, rising `rise` to the ridge.
 * The slopes are steep at the ridge and flatten toward the eaves (the shrine's sweep), `thick` thick.
 */
export function gableRoof(w: number, half: number, rise: number, thick: number, sweep = 1): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 14;
  const prof = (u: number): number => rise * Math.pow(1 - Math.abs(u), 1 + 0.6 * sweep); // steep at the ridge, flattening out to the eaves
  for (let i = 0; i <= n * 2; i++) {
    const u = -1 + i / n;
    const p = [u * half, prof(u)] as const;
    if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  }
  for (let i = n * 2; i >= 0; i--) {
    const u = -1 + i / n;
    s.lineTo(u * half, prof(u) - thick);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2); // the profile across z, the length along x
  g.computeVertexNormals();
  return g;
}

/** A box bent upward at its ends (a torii's top beam): `lift` at the tips, rising as the cube of the distance out. */
function upturned(len: number, h: number, d: number, lift: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(len, h, d, 32, 1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = Math.abs(pos.getX(i)) / (len / 2);
    pos.setY(i, pos.getY(i) + lift * u * u * u + (pos.getY(i) > 0 ? 0.04 * u : 0));
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// the mine head
// ---------------------------------------------------------------------------------------------

/**
 * The headframe over Shaft Three: four battered legs braced in X on every face, a grated head with a railing, the two
 * winding wheels on their axle (the cage's rope off the west edge of one, the counterweight's off the other), the back
 * struts down to their footings, and the ropes away east to the winding house. `cableTop`: where the cage's rope
 * leaves the wheel (`look.ts` hangs it). Collides only at the struts' footings. Returns where the ropes go.
 */
export function headframe(b: LevelBuilder, C: { x: number; z: number }, cableTop: number, winder: { x: number; y: number; z: number }): void {
  const steel = own('hf-steel', 0x2c2522, 0.6, { metalness: 0.6 });
  const rust = own('hf-rust', 0x5a3424, 0.75, { metalness: 0.4 });
  const cx = C.x;
  const cz = C.z;
  const H = 20.6;
  // the frame tapers from the shaft house's corners to a head round the wheels
  const base = { x0: cx - 3.2, x1: cx + 3.2, z0: cz - 3.3, z1: cz + 2.3 };
  const top = { x0: cx - 0.9, x1: cx + 2.4, z0: cz - 2.1, z1: cz + 0.9 };
  const at = (fx: number, fz: number, y: number): P3 => {
    const k = y / H;
    return [lerp(fx ? base.x1 : base.x0, fx ? top.x1 : top.x0, k), y, lerp(fz ? base.z1 : base.z0, fz ? top.z1 : top.z0, k)];
  };
  for (const fx of [0, 1]) for (const fz of [0, 1]) beam(b, steel, at(fx, fz, 0), at(fx, fz, H + 0.1), 0.44, 0.44);
  const levels = [5.4, 9.2, 13, 16.8, H];
  const faces: [number, number, number, number][] = [
    [0, 0, 1, 0],
    [0, 1, 1, 1],
    [0, 0, 0, 1],
    [1, 0, 1, 1],
  ];
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i]!;
    for (const [ax, az, ex, ez] of faces) beam(b, steel, at(ax, az, y), at(ex, ez, y), 0.24, 0.24);
    if (i === 0) continue;
    const y0 = levels[i - 1]!;
    for (const [ax, az, ex, ez] of faces) {
      beam(b, rust, at(ax, az, y0), at(ex, ez, y), 0.12, 0.12, false);
      beam(b, rust, at(ex, ez, y0), at(ax, az, y), 0.12, 0.12, false);
    }
  }
  // the head: a grated deck reaching east under the wheels, its railing
  const dx0 = top.x0 - 0.5;
  const dx1 = cx + 3.6;
  const dz0 = top.z0 - 0.6;
  const dz1 = top.z1 + 0.6;
  box(b, 'grating', (dx0 + dx1) / 2, H + 0.12, (dz0 + dz1) / 2, dx1 - dx0, 0.12, dz1 - dz0);
  for (const [a, e] of [
    [[dx0, dz0], [dx1, dz0]],
    [[dx0, dz1], [dx1, dz1]],
    [[dx0, dz0], [dx0, dz1]],
    [[dx1, dz0], [dx1, dz1]],
  ] as const) {
    for (const y of [H + 0.65, H + 1.15]) beam(b, steel, [a[0], y, a[1]], [e[0], y, e[1]], 0.05, 0.05, false);
    const L = Math.hypot(e[0] - a[0], e[1] - a[1]);
    const n = Math.max(1, Math.round(L / 1.2));
    for (let k = 0; k <= n; k++) box(b, steel, lerp(a[0], e[0], k / n), H + 0.7, lerp(a[1], e[1], k / n), 0.06, 1.15, 0.06, 0, false);
  }
  // the wheels: the cage's at the cage's z, the counterweight's beside it; the rope leaves each from its west edge
  const wr = 1.5;
  const wx = cx + wr;
  const wy = cableTop;
  const wheelZ = [cz, cz - 1.3];
  const wheelMat = own('hf-wheel', 0x6a2a1e, 0.55, { metalness: 0.6 });
  for (const z of wheelZ) {
    put(b, new THREE.TorusGeometry(wr, 0.1, 8, 40), wheelMat, wx, wy, z);
    put(b, new THREE.TorusGeometry(wr - 0.16, 0.05, 6, 40), wheelMat, wx, wy, z);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      beam(b, wheelMat, [wx, wy, z], [wx + Math.cos(a) * (wr - 0.15), wy + Math.sin(a) * (wr - 0.15), z], 0.07, 0.05, false);
    }
    put(b, new THREE.CylinderGeometry(0.24, 0.24, 0.36, 12), steel, wx, wy, z, Math.PI / 2);
  }
  // the axle and its pedestals (an A of steel each side and between the wheels)
  put(b, new THREE.CylinderGeometry(0.08, 0.08, 2.9, 8), steel, wx, wy, cz - 0.65, Math.PI / 2);
  for (const z of [cz + 0.75, cz - 0.65, cz - 2.05]) {
    beam(b, steel, [wx - 1.1, H + 0.15, z], [wx, wy, z], 0.18, 0.14);
    beam(b, steel, [wx + 1.1, H + 0.15, z], [wx, wy, z], 0.18, 0.14);
    box(b, steel, wx, wy, z, 0.36, 0.3, 0.2);
  }
  // the counterweight's rope down the shaft (the cage's is `look.ts`'s), and both ropes away to the winding house
  const ropeMat = own('hf-rope', 0x141414, 0.7);
  beam(b, ropeMat, [cx, wy, wheelZ[1]!], [cx, 5.3, wheelZ[1]!], 0.05, 0.05, false);
  for (const z of wheelZ) rope(b, ropeMat, sagging([wx + 0.05, wy + wr, z], [winder.x, winder.y, winder.z + (z - cz) * 0.8], 0.9), 0.035);
  // the back struts: from the head's east corners down to their footings toward the winding house
  const feet: P3[] = [
    [cx + 8, 0, base.z0 - 0.4],
    [cx + 8, 0, base.z1 + 0.4],
  ];
  const tops = [at(1, 0, H), at(1, 1, H)];
  for (let i = 0; i < 2; i++) {
    beam(b, steel, tops[i]!, feet[i]!, 0.4, 0.4);
    box(b, 'concreteDark', feet[i]![0], 0.35, feet[i]![2], 1.2, 0.7, 1.2);
    b.collide({ x: feet[i]![0], z: feet[i]![2], hx: 0.6, hz: 0.6, y0: 0, y1: 2.2, mapKind: 'prop', surface: 'metal', tag: 'headframe-strut' });
  }
  // ties between the struts, and from each strut back to the frame
  for (const t of [0.3, 0.55, 0.8]) {
    const pa = V(tops[0]!).lerp(V(feet[0]!), t);
    const pb = V(tops[1]!).lerp(V(feet[1]!), t);
    beam(b, steel, [pa.x, pa.y, pa.z], [pb.x, pb.y, pb.z], 0.18, 0.18);
    if (t < 0.6) {
      for (const [p, fz] of [
        [pa, 0],
        [pb, 1],
      ] as const) {
        beam(b, rust, [p.x, p.y, p.z], at(1, fz, Math.max(5.4, p.y - 2)), 0.12, 0.12, false);
      }
    }
  }
  // the warning lamp on top
  box(b, own('hf-lamp', 0x401010, 0.5, { emissive: 0xff2a1a, emissiveIntensity: 2 }), dx1 - 0.2, H + 1.5, dz0 + 0.2, 0.2, 0.2, 0.2, 0, false);
}

/** The winding house's drum (inside it, seen through the door): a big drum on a frame, a motor beside it. */
export function windingDrum(b: LevelBuilder, x: number, z: number): void {
  const steel = own('hf-steel', 0x2c2522, 0.6, { metalness: 0.6 });
  put(b, new THREE.CylinderGeometry(1.1, 1.1, 2, 20), own('hf-drum', 0x3a3430, 0.5, { metalness: 0.7 }), x, 1.5, z, Math.PI / 2);
  for (const dz of [-1.1, 1.1]) put(b, new THREE.CylinderGeometry(1.35, 1.35, 0.12, 20), steel, x, 1.5, z + dz, Math.PI / 2);
  for (const dz of [-1.3, 1.3]) box(b, steel, x, 0.75, z + dz, 0.5, 1.5, 0.3);
  box(b, own('hf-motor', 0x2a4a3a, 0.5, { metalness: 0.5 }), x + 1.8, 0.7, z, 1.2, 1.4, 1.2);
}

// ---------------------------------------------------------------------------------------------
// the summit's shrine
// ---------------------------------------------------------------------------------------------

/** A myōjin torii: leaning vermilion pillars, black footings and collars, the tie beam through them, the plaque, the
 * top beams sweeping up at their tips. Faces z. Collides at its pillars. */
export function islandTorii(b: LevelBuilder, x: number, y: number, z: number, s = 1): void {
  const red = MAT.vermilion();
  const black = MAT.blackLacquer();
  const span = 3.8 * s;
  const H = 4.4 * s;
  for (const side of [-1, 1]) {
    const px = x + (side * span) / 2;
    put(b, new THREE.CylinderGeometry(0.19 * s, 0.24 * s, H, 16), red, px, y + H / 2, z, 0, 0, side * 0.035);
    put(b, new THREE.CylinderGeometry(0.31 * s, 0.33 * s, 0.5 * s, 16), black, px + side * 0.0, y + 0.25 * s, z);
    put(b, new THREE.CylinderGeometry(0.25 * s, 0.25 * s, 0.22 * s, 16), black, px - side * 0.07 * s, y + H - 0.1 * s, z);
    b.collide({ x: px, z, hx: 0.3 * s, hz: 0.3 * s, y0: 0, y1: y + H, mapKind: 'prop', tag: 'torii', surface: 'wood' });
  }
  box(b, red, x, y + H - 1.0 * s, z, span + 1.3 * s, 0.26 * s, 0.2 * s);
  box(b, red, x, y + H - 0.5 * s, z, 0.24 * s, 0.75 * s, 0.18 * s);
  box(b, black, x, y + H - 0.5 * s, z + 0.12 * s, 0.6 * s, 0.82 * s, 0.06 * s);
  box(b, own('torii-gold', 0xc8a050, 0.4, { metalness: 0.6 }), x, y + H - 0.5 * s, z + 0.16 * s, 0.12 * s, 0.5 * s, 0.02 * s, 0, false);
  put(b, upturned(span + 1.9 * s, 0.3 * s, 0.38 * s, 0.22 * s), red, x, y + H + 0.17 * s, z);
  put(b, upturned(span + 2.5 * s, 0.26 * s, 0.5 * s, 0.38 * s), black, x, y + H + 0.45 * s, z);
}

/** A komainu on its plinth: a sitting guardian of stone, looking out along `yaw`. Collides. */
function komainu(b: LevelBuilder, x: number, y: number, z: number, yaw: number, mouthOpen: boolean): void {
  const st = MAT.stone();
  const dark = MAT.stoneDark();
  box(b, dark, x, y + 0.45, z, 0.9, 0.9, 1.1);
  box(b, st, x, y + 0.95, z, 0.8, 0.1, 1.0);
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, px: number, py: number, pz: number, sx = 1, sy = 1, sz = 1): void => {
    const m = new THREE.Mesh(geo, st);
    m.position.set(px, py, pz);
    m.scale.set(sx, sy, sz);
    g.add(m);
  };
  add(new THREE.SphereGeometry(0.3, 12, 8), 0, 0.3, -0.18, 1, 0.9, 1.2); // haunches
  add(new THREE.SphereGeometry(0.24, 12, 8), 0, 0.55, 0.1, 1, 1.4, 0.9); // chest
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), sx * 0.13, 0.25, 0.2); // forelegs
  add(new THREE.IcosahedronGeometry(0.26, 1), 0, 0.95, 0.12, 1.1, 1, 0.9); // mane
  add(new THREE.SphereGeometry(0.17, 12, 8), 0, 0.92, 0.3, 1.1, 0.9, 1); // face
  add(new THREE.BoxGeometry(0.2, mouthOpen ? 0.06 : 0.03, 0.08), 0, 0.84, 0.44); // mouth
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.045, 8, 6), sx * 0.08, 0.98, 0.45); // eyes
  add(new THREE.IcosahedronGeometry(0.12, 0), 0, 0.7, -0.45, 1, 1.6, 1); // tail
  g.position.set(x, y + 1.0, z);
  g.rotation.y = yaw;
  b.add(g);
  b.collide({ x, z, hx: 0.5, hz: 0.6, y0: 0, y1: y + 2.1, mapKind: 'prop', tag: 'komainu', surface: 'concrete' });
}

/**
 * The summit's shrine hall (faces +z, toward its torii): a stone platform, a hall raised on a veranda with a railing,
 * vermilion posts and tie beams, lattice doors lit from inside, a sweeping gabled roof with crossed chigi and katsuogi
 * logs, the sacred rope with its paper streamers, the bell and the offering box; komainu by the approach, a water
 * pavilion and an ema rack. (`hirasaka.ts` keeps the hall's collider.) Returns the water pavilion's and the rack's spots.
 */
export function islandShrine(b: LevelBuilder, x: number, y: number, z: number): void {
  const red = MAT.vermilion();
  const black = MAT.blackLacquer();
  const wood = MAT.woodDark();
  const light = MAT.woodLight();
  // the platform and its steps
  box(b, MAT.stoneDark(), x, y + 0.3, z, 7.4, 0.6, 6.4);
  box(b, MAT.stone(), x, y + 0.62, z, 7.5, 0.06, 6.5, 0, false);
  for (let k = 0; k < 3; k++) box(b, MAT.stone(), x, y + 0.1 + k * 0.2, z + 3.2 + (2 - k) * 0.3 + 0.15, 2.6, 0.2, 0.3);
  // the veranda and the hall
  const fy = y + 0.95;
  box(b, light, x, fy, z, 6.8, 0.14, 5.8);
  const bz = z - 0.5; // the hall's body sits back on the veranda
  const bw = 5.4;
  const bd = 3.8;
  const wallH = 2.9;
  box(b, wood, x, fy + wallH / 2, bz, bw, wallH, bd);
  // posts at the corners and along the front, tie beams round the walls
  for (const px of [-bw / 2, -bw / 6, bw / 6, bw / 2]) for (const pz of [-bd / 2, bd / 2]) put(b, new THREE.CylinderGeometry(0.13, 0.13, wallH + 0.1, 12), red, x + px, fy + wallH / 2, bz + pz);
  for (const yy of [fy + 0.25, fy + wallH - 0.25]) {
    box(b, red, x, yy, bz + bd / 2 + 0.06, bw + 0.2, 0.18, 0.08);
    box(b, red, x, yy, bz - bd / 2 - 0.06, bw + 0.2, 0.18, 0.08);
    for (const sx of [-1, 1]) box(b, red, x + sx * (bw / 2 + 0.06), yy, bz, 0.08, 0.18, bd + 0.2);
  }
  // lattice doors on the front, lit paper behind
  const paper = own('shrine-paper', 0xe8d8b0, 0.9, { emissive: 0xffa850, emissiveIntensity: 0.55 });
  const fz = bz + bd / 2 + 0.02;
  for (const cx of [-bw / 3, 0, bw / 3]) {
    const px = x + cx;
    box(b, paper, px, fy + 1.3, fz, 1.5, 2.1, 0.03, 0, false);
    for (let k = 0; k <= 6; k++) box(b, light, px - 0.72 + k * 0.24, fy + 1.3, fz + 0.03, 0.04, 2.1, 0.04, 0, false);
    for (let k = 0; k <= 7; k++) box(b, light, px, fy + 0.25 + k * 0.3, fz + 0.03, 1.5, 0.04, 0.04, 0, false);
  }
  // the veranda's railing (round the front and sides, open at the steps)
  const ry = fy + 0.55;
  const vz = z + 2.8;
  for (const sx of [-1, 1]) {
    beam(b, red, [x + sx * 1.4, ry, vz], [x + sx * 3.3, ry, vz], 0.08, 0.08);
    beam(b, red, [x + sx * 3.3, ry, vz], [x + sx * 3.3, ry, z - 2.8], 0.08, 0.08);
    for (let k = 0; k <= 3; k++) box(b, red, x + sx * (1.4 + (k * 1.9) / 3), fy + 0.28, vz, 0.07, 0.55, 0.07, 0, false);
    for (let k = 0; k <= 4; k++) box(b, red, x + sx * 3.3, fy + 0.28, vz - (k * 5.6) / 4, 0.07, 0.55, 0.07, 0, false);
  }
  // the roof: gabled along x, sweeping out over the veranda; the gable ends filled
  const roofY = fy + wallH + 0.15;
  put(b, gableRoof(bw + 2.6, bd / 2 + 2.0, 2.1, 0.22, 1.2), MAT.tileRoof(), x, roofY, bz);
  put(b, gableRoof(bw + 2.7, bd / 2 + 2.05, 2.1, 0.06, 1.2), own('shrine-copper', 0x3e6a5a, 0.5, { metalness: 0.4 }), x, roofY + 0.03, bz, 0, 0, 0, false);
  const tri = new THREE.Shape();
  tri.moveTo(-bd / 2, 0);
  tri.lineTo(bd / 2, 0);
  tri.lineTo(0, 1.95);
  tri.closePath();
  for (const sx of [-1, 1]) {
    const g = new THREE.ShapeGeometry(tri);
    g.rotateY(Math.PI / 2);
    put(b, g, wood, x + sx * (bw / 2), roofY - 0.05, bz, 0, 0, 0, false);
    const g2 = new THREE.ShapeGeometry(tri);
    g2.rotateY(-Math.PI / 2);
    put(b, g2, wood, x + sx * (bw / 2), roofY - 0.05, bz, 0, 0, 0, false);
  }
  // the frieze between the walls' tops and the roof, front and back
  for (const sz of [-1, 1]) box(b, wood, x, fy + wallH + 0.4, bz + sz * (bd / 2), bw, 0.8, 0.12, 0, false);
  const ridgeY = roofY + 2.1;
  box(b, black, x, ridgeY + 0.1, bz, bw + 2.8, 0.26, 0.42);
  // chigi: crossed boards at each gable end; katsuogi: logs across the ridge
  for (const sx of [-1, 1]) {
    for (const lean of [-1, 1]) put(b, new THREE.BoxGeometry(0.08, 1.5, 0.22), black, x + sx * (bw / 2 + 1.2), ridgeY + 0.6, bz + lean * 0.3, lean * 0.6, 0, 0);
  }
  for (const px of [-1.6, -0.55, 0.55, 1.6]) put(b, new THREE.CylinderGeometry(0.13, 0.13, 0.9, 10), own('shrine-gold', 0xb08a40, 0.45, { metalness: 0.5 }), x + px, ridgeY + 0.38, bz, Math.PI / 2);
  // the sacred rope across the front, and its paper streamers
  const straw = own('shimenawa', 0xc8b070, 0.95);
  const rz = vz + 0.1;
  rope(b, straw, sagging([x - 2.4, fy + 2.45, rz], [x + 2.4, fy + 2.45, rz], 0.4, 10), 0.13, 30);
  const white = own('shide', 0xf4f0e6, 0.9);
  for (const px of [-1.5, -0.5, 0.5, 1.5]) {
    const top = fy + 2.45 - 0.4 * 4 * ((px + 2.4) / 4.8) * (1 - (px + 2.4) / 4.8) - 0.1;
    for (let k = 0; k < 4; k++) box(b, white, x + px + (k % 2 ? 0.06 : -0.06), top - 0.12 - k * 0.14, rz, 0.12, 0.14, 0.01, 0, false);
  }
  // the bell and its rope, the offering box
  put(b, new THREE.SphereGeometry(0.22, 12, 10), own('bell', 0x8a6a2a, 0.35, { metalness: 0.8 }), x, fy + 2.2, rz - 0.15);
  rope(b, own('bellrope', 0xb03030, 0.9), [[x, fy + 2.0, rz - 0.15], [x + 0.02, fy + 1.4, rz - 0.1], [x, fy + 0.7, rz - 0.05]], 0.05, 8);
  box(b, light, x, fy + 0.4, vz - 0.4, 1.4, 0.7, 0.7);
  for (let k = 0; k < 6; k++) box(b, black, x - 0.6 + k * 0.24, fy + 0.77, vz - 0.4, 0.05, 0.04, 0.7, 0, false);
  box(b, MAT.woodDark(), x, fy + 0.95, vz - 0.4, 0.8, 0.12, 0.08, 0, false);
}

/** The komainu, the water pavilion and the ema rack round the summit shrine at (x, z). Collide. */
export function shrineGrounds(b: LevelBuilder, x: number, y: number, z: number): void {
  komainu(b, x - 2.9, y, z + 6.6, 0, true);
  komainu(b, x + 2.9, y, z + 6.6, 0, false);
  // the water pavilion: four posts, a little gabled roof, the stone basin and its ladles
  const wx = x - 7.2;
  const wz = z + 5.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(b, new THREE.CylinderGeometry(0.1, 0.1, 2.4, 10), MAT.vermilion(), wx + sx * 1.1, y + 1.2, wz + sz * 0.8);
  box(b, MAT.vermilion(), wx, y + 2.35, wz, 2.4, 0.14, 1.8, 0, false);
  put(b, gableRoof(3, 1.5, 0.8, 0.12, 1), MAT.tileRoof(), wx, y + 2.45, wz);
  box(b, MAT.blackLacquer(), wx, y + 3.3, wz, 3.1, 0.14, 0.2, 0, false);
  box(b, MAT.stone(), wx, y + 0.4, wz, 1.6, 0.8, 0.9);
  box(b, own('basin-water', 0x1a2a30, 0.08, { metalness: 0.5 }), wx, y + 0.79, wz, 1.4, 0.02, 0.7, 0, false);
  for (let k = 0; k < 3; k++) {
    const lx = wx - 0.4 + k * 0.4;
    beam(b, own('bamboo', 0xb8a868, 0.7), [lx, y + 0.84, wz - 0.1], [lx, y + 0.84, wz + 0.45], 0.03, 0.03, false);
    put(b, new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), own('bamboo', 0xb8a868, 0.7), lx, y + 0.86, wz - 0.12, 0, 0, 0, false);
  }
  b.collide({ x: wx, z: wz, hx: 1.25, hz: 0.95, y0: 0, y1: y + 2.4, mapKind: 'prop', tag: 'temizuya', surface: 'wood' });
  // the ema rack: wooden plaques hung in rows under a little roof
  const ex = x + 6.2;
  const ez = z + 4.2;
  for (const sx of [-1, 1]) box(b, MAT.woodDark(), ex + sx * 1.3, y + 1.0, ez, 0.12, 2, 0.12);
  for (const yy of [y + 0.9, y + 1.45]) box(b, MAT.woodDark(), ex, yy, ez, 2.7, 0.06, 0.06, 0, false);
  box(b, MAT.tileRoof(), ex, y + 2.05, ez, 3.0, 0.08, 0.8, 0, false);
  const plaque = own('ema', 0xc8a878, 0.85);
  const seed = { s: 7 };
  const r = (): number => ((seed.s = (seed.s * 16807) % 2147483647) / 2147483647);
  for (const yy of [y + 0.75, y + 1.3]) {
    for (let k = 0; k < 11; k++) put(b, new THREE.BoxGeometry(0.2, 0.14, 0.012), plaque, ex - 1.15 + k * 0.23 + (r() - 0.5) * 0.04, yy - 0.06, ez + 0.05 + r() * 0.03, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.25, false);
  }
  b.collide({ x: ex, z: ez, hx: 1.45, hz: 0.3, y0: 0, y1: y + 2.1, mapKind: 'prop', tag: 'ema', surface: 'wood' });
}

// ---------------------------------------------------------------------------------------------
// Block 65's fire stair
// ---------------------------------------------------------------------------------------------

/**
 * The outside stair up Block 65's face, drawn in full: closed steel stringers, grated treads with nosings, a handrail
 * and a mid rail each side on posts, and the frame that carries it: columns under the open side, brackets back into the
 * block. (`hirasaka.ts` keeps the treads' floors and the rails' stops.)
 */
export function fireStair(b: LevelBuilder, S: { xFoot: number; xTop: number; z: number; w: number; yFoot: number; yTop: number }, wallZ: number, stepH: number): void {
  const steel = own('fs-steel', 0x3a3e40, 0.55, { metalness: 0.6 });
  const n = Math.round((S.yTop - S.yFoot) / stepH);
  const run = (S.xFoot - S.xTop) / n;
  const yAt = (x: number): number => S.yFoot + ((S.xFoot - x) / (S.xFoot - S.xTop)) * (S.yTop - S.yFoot);
  for (let i = 0; i < n; i++) {
    const top = S.yFoot + (i + 1) * stepH;
    const xa = S.xFoot - i * run;
    const xb = xa - run;
    box(b, 'grating', (xa + xb) / 2, top - 0.03, S.z, run + 0.02, 0.06, S.w, 0, false);
    box(b, steel, xa - 0.03, top - 0.06, S.z, 0.06, 0.12, S.w, 0, false);
  }
  const zs = [S.z - S.w / 2 - 0.06, S.z + S.w / 2 + 0.06];
  for (const z of zs) {
    // the stringer, its top following the nosings
    beam(b, steel, [S.xFoot + 0.15, S.yFoot - 0.05, z], [S.xTop, S.yTop - 0.05, z], 0.34, 0.08);
    // the rails, on posts every third step
    for (const h of [0.95, 0.5]) beam(b, steel, [S.xFoot, S.yFoot + h + stepH, z], [S.xTop, S.yTop + h, z], 0.05, 0.05, false);
    for (let i = 0; i <= n; i += 3) {
      const x = S.xFoot - i * run - run / 2;
      const y = S.yFoot + (i + 1) * stepH;
      box(b, steel, x, y + 0.48, z, 0.06, 0.96, 0.06, 0, false);
    }
  }
  // columns under the open side, brackets from each to the wall, a cross brace between them
  const open = zs[1]!;
  let prev: P3 | null = null;
  for (let x = S.xFoot - 2.2; x > S.xTop + 0.5; x -= 3.4) {
    const y = yAt(x) - 0.3;
    box(b, steel, x, (S.yFoot + y) / 2, open, 0.24, y - S.yFoot, 0.24);
    beam(b, steel, [x, y, open], [x, y, wallZ], 0.22, 0.14);
    box(b, steel, x, y - 0.1, wallZ + 0.1, 0.3, 0.4, 0.2, 0, false);
    if (prev) beam(b, steel, prev, [x, y - 0.2, open], 0.08, 0.08, false);
    prev = [x, S.yFoot + 0.2, open];
  }
  box(b, 'concreteDark', S.xFoot + 0.6, S.yFoot + 0.05, S.z, 1.4, 0.1, S.w + 0.6, 0, false);
}

// ---------------------------------------------------------------------------------------------
// Market Lane's open shops
// ---------------------------------------------------------------------------------------------

export type ShopKind = 'fish' | 'rice' | 'canteen' | 'sweets' | 'sake' | 'post';

/**
 * An open shop's inside (the front is `shopFront`'s): walls, a ceiling with a lamp, a tiled floor, shelves of goods on the
 * back wall, a counter, and what that shop sold. `z0` its back wall, `zf` its front, `w` its width.
 */
export function shopInside(b: LevelBuilder, kind: ShopKind, x: number, y: number, z0: number, zf: number, w: number, seed: number): void {
  const d = zf - z0;
  const zc = (z0 + zf) / 2;
  let s = seed * 9301 + 49297;
  const r = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  const zb = z0 + 0.35; // the back wall, clear of the retaining wall's pipes
  box(b, 'plaster', x, y + 1.8, zb, w, 3.6, 0.2, 0, false);
  for (const sx of [-1, 1]) box(b, 'plaster', x + sx * (w / 2 - 0.1), y + 1.8, zc, 0.2, 3.6, d, 0, false);
  box(b, 'plaster', x, y + 3.55, zc, w, 0.1, d, 0, false);
  box(b, 'tile', x, y + 0.02, zc, w - 0.4, 0.04, d - 0.1, 0, false);
  box(b, 'lampWarm', x, y + 3.45, zc, 1.4, 0.06, 0.2, 0, false);
  // the shelves on the back wall and their goods
  const shelfMat = MAT.woodDark();
  const goods = [0xc84a3a, 0xe8c050, 0x4a8ac8, 0xe8e0d0, 0x5aa86a, 0xd87aa8, 0x8a6a46].map((c, i) => own(`goods${i}`, c, 0.7));
  const shelfW = w - 2.6;
  const sx0 = x - w / 2 + 0.4;
  for (let k = 0; k < 4; k++) {
    const yy = y + 0.4 + k * 0.55;
    box(b, shelfMat, sx0 + shelfW / 2, yy, zb + 0.32, shelfW, 0.05, 0.45, 0, false);
    if (kind === 'post') continue;
    for (let gx = sx0 + 0.15; gx < sx0 + shelfW - 0.15; gx += 0.22 + r() * 0.12) {
      if (r() < 0.18) continue;
      const h = 0.14 + r() * 0.26;
      const m = goods[Math.floor(r() * goods.length)]!;
      if (kind === 'sake' || kind === 'sweets') put(b, new THREE.CylinderGeometry(0.06, 0.07, h + 0.1, 8), kind === 'sake' ? own('bottle', 0x2a4a2a, 0.15, { metalness: 0.2 }) : own('jar', 0xd8e8e8, 0.1, { transparent: true, opacity: 0.6 }), gx, yy + 0.05 + (h + 0.1) / 2, zb + 0.32, 0, 0, 0, false);
      else box(b, m, gx, yy + 0.03 + h / 2, zb + 0.32 + (r() - 0.5) * 0.1, 0.16, h, 0.24, (r() - 0.5) * 0.3, false);
    }
  }
  for (const k of [0, 1]) box(b, shelfMat, sx0 + k * shelfW, y + 1.1, zb + 0.32, 0.06, 2.2, 0.46, 0, false);
  // the counter, by the right-hand wall, the till on it
  const cx = x + w / 2 - 1.1;
  box(b, MAT.woodLight(), cx, y + 0.45, zc - 0.2, 0.7, 0.9, d - 1.4);
  box(b, MAT.woodDark(), cx, y + 0.92, zc - 0.2, 0.8, 0.05, d - 1.3, 0, false);
  box(b, own('till', 0x3a3a3a, 0.5, { metalness: 0.4 }), cx, y + 1.06, zc - 0.5, 0.36, 0.22, 0.3, 0, false);
  // what the shop sold
  switch (kind) {
    case 'fish': {
      for (const dx of [-2.2, -0.6]) {
        box(b, own('fish-tub', 0xd8dde0, 0.4), x + dx, y + 0.35, zf - 0.8, 1.3, 0.7, 0.8);
        box(b, own('ice', 0xe8f4f8, 0.15, { metalness: 0.1 }), x + dx, y + 0.71, zf - 0.8, 1.2, 0.04, 0.7, 0, false);
        for (let k = 0; k < 5; k++) put(b, new THREE.SphereGeometry(0.07, 8, 6), own('fish', 0x8a9aa8, 0.3, { metalness: 0.5 }), x + dx - 0.45 + k * 0.22, y + 0.76, zf - 0.8 + (r() - 0.5) * 0.3, 0, r() * 3, 0, false).scale.set(3, 0.7, 1);
      }
      break;
    }
    case 'rice': {
      for (let k = 0; k < 7; k++) {
        const sx = x - 2.8 + (k % 4) * 0.75;
        const sy = y + 0.25 + Math.floor(k / 4) * 0.42;
        put(b, new THREE.SphereGeometry(0.34, 10, 6), 'canvasTan', sx, sy, zf - 0.9, 0, k, 0, false).scale.set(1, 0.62, 0.75);
      }
      box(b, own('scale', 0x6a6a5a, 0.4, { metalness: 0.6 }), x + 0.6, y + 0.4, zf - 0.8, 0.6, 0.8, 0.5);
      break;
    }
    case 'canteen': {
      for (const dx of [-2.4, -0.6]) {
        box(b, MAT.woodLight(), x + dx, y + 0.72, zc + 0.2, 1.1, 0.06, 0.8);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, MAT.woodDark(), x + dx + sx * 0.48, y + 0.36, zc + 0.2 + sz * 0.33, 0.05, 0.72, 0.05, 0, false);
        for (const sz of [-1, 1]) put(b, new THREE.CylinderGeometry(0.17, 0.17, 0.45, 10), MAT.woodDark(), x + dx, y + 0.22, zc + 0.2 + sz * 0.7, 0, 0, 0, false);
      }
      for (let k = 0; k < 6; k++) box(b, 'paintWhite', x - 3.4 + k * 0.42, y + 2.65, zb + 0.12, 0.32, 0.6, 0.02, 0, false);
      break;
    }
    case 'sweets': {
      box(b, own('glass-case', 0xb8d0d8, 0.05, { transparent: true, opacity: 0.35, metalness: 0.3 }), x - 1.2, y + 0.55, zf - 0.8, 2.6, 1.1, 0.7, 0, false);
      for (let k = 0; k < 14; k++) box(b, goods[k % goods.length]!, x - 2.3 + (k % 7) * 0.36, y + 0.35 + Math.floor(k / 7) * 0.35, zf - 0.8, 0.22, 0.12, 0.3, 0, false);
      break;
    }
    case 'sake': {
      for (let k = 0; k < 3; k++) {
        put(b, new THREE.CylinderGeometry(0.42, 0.42, 0.9, 14), own('cask', 0xd8c8a0, 0.8), x - 2.6 + k * 0.95, y + 0.45, zf - 0.8);
        put(b, new THREE.CylinderGeometry(0.43, 0.43, 0.08, 14), own('cask-band', 0x2a3a5a, 0.7), x - 2.6 + k * 0.95, y + 0.75, zf - 0.8, 0, 0, 0, false);
      }
      break;
    }
    case 'post': {
      // the pigeonholes on the back wall, the scales, the red postbox out front
      for (let i = 0; i < 4; i++) for (let j = 0; j < 9; j++) box(b, own('letter', 0xe8e0c8, 0.9), sx0 + 0.25 + j * ((shelfW - 0.4) / 8), y + 0.55 + i * 0.55, zb + 0.35, 0.2, 0.12, 0.3, 0, false);
      put(b, new THREE.CylinderGeometry(0.3, 0.3, 1.3, 16), own('postbox', 0xc02a1e, 0.5), x - w / 2 + 1, y + 0.65, zf + 0.7);
      put(b, new THREE.SphereGeometry(0.31, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), own('postbox', 0xc02a1e, 0.5), x - w / 2 + 1, y + 1.3, zf + 0.7);
      box(b, MAT.blackLacquer(), x - w / 2 + 1, y + 1.0, zf + 1.0, 0.3, 0.05, 0.02, 0, false);
      b.collide({ x: x - w / 2 + 1, z: zf + 0.7, hx: 0.32, hz: 0.32, y0: 0, y1: y + 1.6, mapKind: 'prop', tag: 'postbox', surface: 'metal' });
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// the schoolyard and the block's roof
// ---------------------------------------------------------------------------------------------

/** A bicycle shed: posts and a sloped corrugated roof along x from x0 to x1 at z, a row of bikes under it. Collides at its posts. */
export function bikeShed(b: LevelBuilder, x0: number, x1: number, z: number, y: number, seed: number): void {
  const steel = own('fs-steel', 0x3a3e40, 0.55, { metalness: 0.6 });
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) {
    box(b, steel, x, y + 1.2, z + 1, 0.1, 2.4, 0.1);
    box(b, steel, x, y + 1.0, z - 1, 0.1, 2.0, 0.1);
    b.collide({ x, z: z + 1, hx: 0.1, hz: 0.1, y0: 0, y1: y + 2.4, mapKind: 'prop', surface: 'metal', tag: 'bikeshed' });
    b.collide({ x, z: z - 1, hx: 0.1, hz: 0.1, y0: 0, y1: y + 2.0, mapKind: 'prop', surface: 'metal', tag: 'bikeshed' });
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.6, 0.05, 2.5), b.mats.get('corrugated'));
  roof.position.set((x0 + x1) / 2, y + 2.25, z);
  roof.rotation.x = -0.2;
  b.add(roof);
  let k = 0;
  for (let x = x0 + 0.6; x < x1 - 0.3; x += 0.75) {
    if (((seed + k++) * 7) % 5 === 0) continue;
    bicycle(b, { x, y, z, rot: Math.PI / 2 + ((k % 3) - 1) * 0.08, color: [0x2a4a8a, 0xc0c0c0, 0x8a2a2a, 0x2a6a4a][k % 4] });
  }
}

/** A sports store hut (the school's): a small shed with a sliding door and a vent. Collides. */
export function storeHut(b: LevelBuilder, x: number, z: number, y: number, w: number, d: number): void {
  box(b, 'metalPanel', x, y + 1.2, z, w, 2.4, d);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.08, d + 0.5), b.mats.get('corrugatedRust'));
  roof.position.set(x, y + 2.5, z);
  roof.rotation.x = 0.08;
  b.add(roof);
  box(b, 'paintGrey', x - w / 4, y + 1.0, z + d / 2 + 0.02, w / 2 - 0.2, 2.0, 0.04, 0, false);
  box(b, 'steelDark', x, y + 2.08, z + d / 2 + 0.05, w - 0.2, 0.06, 0.06, 0, false);
  box(b, 'glassDark', x + w / 4, y + 1.8, z + d / 2 + 0.02, 0.8, 0.3, 0.04, 0, false);
  b.collide({ x, z, hx: w / 2, hz: d / 2, y0: 0, y1: y + 2.5, mapKind: 'building', surface: 'metal', tag: 'store-hut' });
}

/** Horizontal bars of three heights (the schoolyard's tetsubō). Collides at its posts. */
export function bars(b: LevelBuilder, x: number, z: number, y: number): void {
  const steel = own('bars', 0x6a7a8a, 0.4, { metalness: 0.6 });
  const hs = [0.9, 1.2, 1.5];
  for (let i = 0; i <= hs.length; i++) {
    const px = x - 2.1 + i * 1.4;
    const h = Math.max(hs[Math.max(0, i - 1)]!, hs[Math.min(hs.length - 1, i)]!);
    box(b, own('bars-post', 0x2a5a9a, 0.5), px, y + h / 2, z, 0.1, h, 0.1);
    b.collide({ x: px, z, hx: 0.08, hz: 0.08, y0: 0, y1: y + h, mapKind: 'prop', surface: 'metal', tag: 'bars' });
  }
  hs.forEach((h, i) => put(b, new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), steel, x - 1.4 + i * 1.4, y + h - 0.04, z, 0, 0, Math.PI / 2, false));
}

/** A flagpole with a torn flag. */
export function flagpole(b: LevelBuilder, x: number, z: number, y: number): void {
  put(b, new THREE.CylinderGeometry(0.05, 0.07, 8, 8), 'steel', x, y + 4, z);
  put(b, new THREE.SphereGeometry(0.1, 8, 6), own('pole-ball', 0xc8a050, 0.4, { metalness: 0.6 }), x, y + 8.05, z, 0, 0, 0, false);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 6, 2), own('flag', 0xe8e4dc, 0.9, { side: THREE.DoubleSide }));
  const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 3) * 0.12);
  flag.position.set(x + 0.72, y + 7.3, z);
  b.add(flag, { cast: false });
  put(b, new THREE.CircleGeometry(0.2, 16), own('flag-sun', 0xb8221a, 0.8, { side: THREE.DoubleSide }), x + 0.72, y + 7.3, z + 0.13, 0, 0, 0, false);
  box(b, MAT.stoneDark(), x, y + 0.2, z, 0.8, 0.4, 0.8);
  b.collide({ x, z, hx: 0.4, hz: 0.4, y0: 0, y1: y + 2, mapKind: 'prop', surface: 'concrete', tag: 'flagpole' });
}

/** A playground: a swing frame with two swings, a slide, a sandpit edged in concrete. Collides at its frames. */
export function playground(b: LevelBuilder, x: number, z: number, y: number): void {
  const blue = own('play-blue', 0x2a6aaa, 0.5, { metalness: 0.3 });
  const red = own('play-red', 0xc0402a, 0.5, { metalness: 0.2 });
  const yel = own('play-yel', 0xe0b030, 0.5);
  // the swings
  const sx = x - 3;
  for (const dx of [-1.4, 1.4]) {
    for (const dz of [-0.8, 0.8]) beam(b, blue, [sx + dx, y, z + dz], [sx + dx, y + 2.4, z], 0.09, 0.09);
    b.collide({ x: sx + dx, z, hx: 0.1, hz: 0.85, y0: 0, y1: y + 2.4, mapKind: 'prop', surface: 'metal', tag: 'swings' });
  }
  beam(b, blue, [sx - 1.5, y + 2.4, z], [sx + 1.5, y + 2.4, z], 0.1, 0.1);
  for (const [dx, tilt] of [
    [-0.6, 0],
    [0.6, 0.35],
  ] as const) {
    const seatY = y + 0.5;
    const seatZ = z + Math.sin(tilt) * 1.9;
    for (const ox of [-0.22, 0.22]) beam(b, 'steel', [sx + dx + ox, y + 2.38, z], [sx + dx + ox, seatY + 0.03, seatZ], 0.015, 0.015, false);
    box(b, red, sx + dx, seatY, seatZ, 0.5, 0.05, 0.22, 0, false);
  }
  // the slide: a ladder up to a platform, the chute down
  const lx = x + 2;
  box(b, yel, lx, y + 1.5, z - 0.6, 0.9, 0.08, 0.9);
  for (const ox of [-0.42, 0.42]) {
    for (const oz of [-1.0, -0.2]) box(b, blue, lx + ox, y + 0.75, z + oz, 0.08, 1.5, 0.08);
    beam(b, blue, [lx + ox, y, z - 1.8], [lx + ox, y + 1.5, z - 1.0], 0.06, 0.06);
  }
  for (let k = 1; k <= 4; k++) beam(b, blue, [lx - 0.42, y + k * 0.3, z - 1.8 + k * 0.16], [lx + 0.42, y + k * 0.3, z - 1.8 + k * 0.16], 0.03, 0.03, false);
  beam(b, own('play-chute', 0xc8c8c8, 0.25, { metalness: 0.8 }), [lx, y + 1.5, z - 0.15], [lx, y + 0.25, z + 1.9], 0.7, 0.03);
  b.collide({ x: lx, z: z - 0.2, hx: 0.5, hz: 1.4, y0: 0, y1: y + 1.6, mapKind: 'prop', surface: 'metal', tag: 'slide' });
  // the sandpit
  for (const [px, pz, w, d] of [
    [x + 6, z - 1.4, 3, 0.2],
    [x + 6, z + 1.4, 3, 0.2],
    [x + 4.5, z, 0.2, 3],
    [x + 7.5, z, 0.2, 3],
  ] as const)
    box(b, 'concreteWall', px, y + 0.15, pz, w, 0.3, d);
  box(b, own('sand', 0xb8a47a, 1), x + 6, y + 0.12, z, 2.8, 0.05, 2.6, 0, false);
  put(b, new THREE.ConeGeometry(0.4, 0.3, 10), own('sand', 0xb8a47a, 1), x + 6.4, y + 0.28, z + 0.3, 0, 0, 0, false);
  put(b, new THREE.CylinderGeometry(0.08, 0.12, 0.18, 8), red, x + 5.5, y + 0.24, z - 0.5, 0.3, 0, 0, false);
}

/** A water tank on a steel stand on the block's roof. Collides at its legs. */
export function waterTower(b: LevelBuilder, x: number, z: number, y: number): void {
  const steel = own('fs-steel', 0x3a3e40, 0.55, { metalness: 0.6 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      box(b, steel, x + sx * 1.2, y + 1.6, z + sz * 1.2, 0.14, 3.2, 0.14);
      b.collide({ x: x + sx * 1.2, z: z + sz * 1.2, hx: 0.1, hz: 0.1, y0: 0, y1: y + 3.2, mapKind: 'prop', surface: 'metal', tag: 'tank' });
    }
  for (const sx of [-1, 1]) {
    beam(b, steel, [x + sx * 1.2, y + 0.3, z - 1.2], [x + sx * 1.2, y + 3, z + 1.2], 0.06, 0.06, false);
    beam(b, steel, [x - 1.2, y + 0.3, z + sx * 1.2], [x + 1.2, y + 3, z + sx * 1.2], 0.06, 0.06, false);
  }
  box(b, steel, x, y + 3.2, z, 2.8, 0.12, 2.8);
  put(b, new THREE.CylinderGeometry(1.3, 1.3, 2.2, 20), own('tank', 0x8a9aa0, 0.6, { metalness: 0.3 }), x, y + 4.4, z);
  put(b, new THREE.ConeGeometry(1.35, 0.5, 20), own('tank', 0x8a9aa0, 0.6, { metalness: 0.3 }), x, y + 5.75, z);
  for (let k = 0; k < 3; k++) put(b, new THREE.TorusGeometry(1.31, 0.03, 4, 24), steel, x, y + 3.6 + k * 0.8, z, Math.PI / 2, 0, 0, false);
  for (let k = 0; k < 6; k++) box(b, steel, x + 1.32, y + 3.5 + k * 0.4, z, 0.04, 0.04, 0.4, 0, false);
}
