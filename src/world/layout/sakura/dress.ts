/**
 * The Sakura District's small things: the Hanami night market's stalls down the covered arcade (the festival the
 * district never finished), the roadside shrine where the first flame still burns before Okada's izakaya, and the
 * streets' paint and furniture - crossings and lane lines, manholes, post boxes, bollards at the arcade's mouths.
 * Every piece is a plain box, cylinder or plane in an existing material (the signs on the shared atlas), so it all bakes
 * into the merged static batches: triangles, not draw calls. Only the stalls and the shrine collide.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../../builder';
import type { Ctx } from '../util';
import { ARCADE, ROADS, ZONES } from './consts';
import { MAT, signTile, tilePlane } from './props';

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  plane: new THREE.PlaneGeometry(1, 1),
};

/** A group in a local frame (x along, z out), baked when done. */
function kit(b: LevelBuilder, x: number, z: number, rot: number): { box: (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx?: number) => void; cyl: (m: THREE.Material, x: number, y: number, z: number, r: number, h: number) => void; add: (o: THREE.Object3D) => void; done: () => void } {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return {
    box: (m, bx, by, bz, sx, sy, sz, rx = 0) => {
      const mesh = new THREE.Mesh(GEO.box, m);
      mesh.position.set(bx, by, bz);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.x = rx;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    },
    cyl: (m, cx, cy, cz, r, h) => {
      const mesh = new THREE.Mesh(GEO.cyl, m);
      mesh.position.set(cx, cy, cz);
      mesh.scale.set(r, h, r);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    },
    add: (o) => g.add(o),
    done: () => {
      g.updateMatrixWorld(true);
      b.add(g);
    },
  };
}

const std = new Map<number, THREE.MeshStandardMaterial>();
const col = (hex: number, rough = 0.8): THREE.MeshStandardMaterial => {
  let m = std.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough });
    std.set(hex, m);
  }
  return m;
};

const STALLS: [string, string, number][] = [
  ['たこ焼き', 'TAKOYAKI', 0xc8321f],
  ['焼きそば', 'YAKISOBA', 0x2a4a8a],
  ['りんご飴', 'CANDY APPLES', 0xc8321f],
  ['金魚すくい', 'GOLDFISH', 0x2a7aa8],
  ['かき氷', 'SHAVED ICE', 0x3a8ac8],
  ['お面', 'MASKS', 0x7a3a8a],
  ['焼き鳥', 'YAKITORI', 0x8a2a1a],
  ['綿あめ', 'CANDY FLOSS', 0xd85a9a],
];

/** A festival stall (yatai): a counter, four posts, a striped awning, a cloth with its name, its goods, two lanterns. Faces +z after `rot`. */
export function yatai(b: LevelBuilder, o: { x: number; z: number; rot: number; i: number; tipped?: boolean }): void {
  const [ja, en, hue] = STALLS[o.i % STALLS.length]!;
  const k = kit(b, o.x, o.z, o.rot);
  const wood = MAT.woodLight();
  const dark = MAT.woodDark();
  const W = 2.3;
  const D = 1.1;
  // the counter and its skirt
  k.box(wood, 0, 0.92, 0.1, W, 0.08, D);
  k.box(col(hue, 0.9), 0, 0.46, 0.5, W, 0.84, 0.04);
  k.box(dark, 0, 0.46, -0.3, W, 0.84, 0.5);
  // posts and the awning, red and white stripes
  for (const [px, pz] of [[-W / 2 + 0.05, 0.6], [W / 2 - 0.05, 0.6], [-W / 2 + 0.05, -0.4], [W / 2 - 0.05, -0.4]] as const) k.box(dark, px, 1.15, pz, 0.07, 2.3, 0.07);
  for (let s = 0; s < 8; s++) k.box(s % 2 ? col(0xf2efe8, 0.9) : col(hue, 0.9), -W / 2 + (s + 0.5) * (W / 8), 2.36, 0.15, W / 8 + 0.005, 0.04, 1.5, -0.22);
  // its name on a cloth along the front of the awning
  const cloth = tilePlane(W - 0.2, 0.36, signTile(ja, { bg: '#f2efe8', fg: `#${hue.toString(16).padStart(6, '0')}`, aspect: (W - 0.2) / 0.36, sub: en, worn: 0.7 }));
  cloth.position.set(0, 2.05, 0.92);
  k.add(cloth);
  // the goods on the counter: little packs and trays in a row
  for (let g = 0; g < 6; g++) k.box(col([0xe8c070, 0xd85030, 0xf2efe8, 0x8ac050, 0xe08aa8, 0x6ab0e0][(g + o.i) % 6]!, 0.7), -0.9 + g * 0.36, 1.0, 0.25 + (g % 2) * 0.12, 0.22, 0.08, 0.16);
  // red paper lanterns at the front corners
  for (const px of [-W / 2 + 0.1, W / 2 - 0.1]) k.cyl(col(0xd8321f, 0.8), px, 1.85, 0.62, 0.13, 0.32);
  // a stool or two
  k.cyl(col(0x3a6aa8, 0.7), -0.6, 0.22, 0.95, 0.16, 0.44);
  if (o.i % 2) k.cyl(col(0x3a6aa8, 0.7), 0.5, 0.22, 1.05, 0.16, 0.44);
  k.done();
  b.collide({ x: o.x, z: o.z, hx: W / 2, hz: D / 2 + 0.1, rot: o.rot, y1: 1.0, blocksShots: false, mapKind: 'prop', tag: 'yatai', surface: 'wood' });
}

/** A little roadside shrine (hokora) on a stone step: where the first flame burns (the flame itself is the runtime's). */
export function hokora(b: LevelBuilder, o: { x: number; z: number; rot: number }): void {
  const k = kit(b, o.x, o.z, o.rot);
  const stone = MAT.stone();
  k.box(stone, 0, 0.18, 0, 1.3, 0.36, 1.0);
  k.box(stone, 0, 0.5, -0.05, 1.0, 0.28, 0.8);
  k.box(MAT.woodDark(), 0, 1.25, -0.1, 0.8, 1.2, 0.62);
  k.box(col(0x0c0a08, 1), 0, 1.25, 0.215, 0.56, 0.8, 0.02); // the open front, dark inside
  k.box(MAT.tileRoof(), 0, 1.98, 0.02, 1.15, 0.12, 0.95, 0.12);
  k.box(MAT.tileRoof(), 0, 2.1, -0.05, 1.2, 0.08, 0.3);
  k.box(MAT.vermilion(), -0.42, 1.0, 0.33, 0.06, 1.0, 0.06);
  k.box(MAT.vermilion(), 0.42, 1.0, 0.33, 0.06, 1.0, 0.06);
  k.box(MAT.vermilion(), 0, 1.55, 0.33, 1.0, 0.07, 0.07);
  k.box(MAT.paper(), 0, 1.47, 0.35, 0.7, 0.03, 0.02); // the shimenawa's paper
  for (const sx of [-0.3, 0.3]) k.box(MAT.paper(), sx, 1.36, 0.36, 0.07, 0.18, 0.01);
  k.done();
  b.collide({ x: o.x, z: o.z, hx: 0.65, hz: 0.5, rot: o.rot, y1: 2.1, mapKind: 'prop', tag: 'hokora', surface: 'concrete' });
}

/**
 * The Hanami night market down the arcade: a stall every so often on alternate sides of the lane (the middle kept clear,
 * the trees, the crates, the stations and the doors left alone), its banners, and the market's odds and ends.
 */
export function nightMarket(c: Ctx, avoid: readonly [number, number][]): void {
  const { b, rng } = c;
  const lanes: [number, number][] = [[ZONES.shotengaiW.x0 + 4, ZONES.shotengaiW.x1 - 4], [ZONES.shotengaiM.x0 + 4, ZONES.shotengaiM.x1 - 4], [ZONES.shotengaiE.x0 + 4, ZONES.shotengaiE.x1 - 4]];
  const free = (x: number, z: number, r: number): boolean => avoid.every(([ax, az]) => Math.hypot(ax - x, az - z) > r);
  let i = 0;
  for (const [x0, x1] of lanes) {
    let north = true;
    for (let x = x0 + 2; x < x1 - 2; x += 5 + rng.f() * 3) {
      // clear of the arcade's posts (every 8 m from the lane's start)
      const fromPost = (((x - (x0 - 4 + 2)) % 8) + 8) % 8;
      if (fromPost < 1.4 || fromPost > 6.6) continue;
      const z = north ? ARCADE.z0 + 1.05 : ARCADE.z1 - 1.05;
      if (!free(x, z, 2.6)) continue;
      yatai(b, { x, z, rot: north ? 0 : Math.PI, i: i++ });
      north = !north;
    }
  }
  // paper fans, cups and skewers dropped in the lane; a few crates of the stalls' stock
  const litter = col(0xe8e0d0, 0.9);
  for (let n = 0; n < 70; n++) {
    const [x0, x1] = lanes[n % 3]!;
    const x = x0 + rng.f() * (x1 - x0);
    const z = ARCADE.z0 + 0.8 + rng.f() * (ARCADE.z1 - ARCADE.z0 - 1.6);
    if (!free(x, z, 1.2)) continue;
    const m = new THREE.Mesh(GEO.box, n % 4 === 0 ? col(0xd8321f, 0.8) : litter);
    m.position.set(x, 0.035, z);
    m.scale.set(0.18 + rng.f() * 0.2, 0.02, 0.1 + rng.f() * 0.14);
    m.rotation.y = rng.f() * Math.PI;
    m.receiveShadow = true;
    m.updateMatrixWorld(true);
    b.add(m);
  }
}

/**
 * The streets' paint and furniture: zebra crossings where the roads meet, dashed lane lines, manholes, a red post box
 * at the corners, bollards across the arcade's mouths.
 */
export function streetDress(c: Ctx): void {
  const { b, rng } = c;
  const paint = b.mats.get('paintWhite');
  const iron = col(0x2a2c30, 0.6);
  const flat = (m: THREE.Material, x: number, z: number, w: number, d: number, y = 0.026, rot = 0): void => {
    const mesh = new THREE.Mesh(GEO.plane, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rot;
    mesh.position.set(x, y, z);
    mesh.scale.set(w, d, 1);
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld(true);
    b.add(mesh, { cast: false, receive: true });
  };
  const S = ROADS.sakura;
  const K = ROADS.kita;
  const H = ROADS.hillside;
  const M = ROADS.kamotsu;
  // zebra crossings on both avenues either side of each cross street
  for (const r of [S, K]) {
    for (const cx of [H.x0 - 3, H.x1 + 3, M.x0 - 3, M.x1 + 3]) {
      for (let z = r.z0 + 0.8; z < r.z1 - 0.6; z += 0.9) flat(paint, cx, z + 0.25, 3.2, 0.45);
    }
  }
  // the cross streets' crossings over each avenue's mouth
  for (const r of [H, M]) {
    for (const cz of [S.z0 - 3, S.z1 + 3, K.z0 - 3, K.z1 + 3]) {
      if (r === M && cz > S.z1) continue; // Kamotsu-dori ends at the avenue
      for (let x = r.x0 + 0.8; x < r.x1 - 0.6; x += 0.9) flat(paint, x + 0.25, cz, 0.45, 3.2);
    }
  }
  // dashed lane lines down the middle of the avenues, broken at the junctions
  for (const r of [S, K]) {
    const zc = (r.z0 + r.z1) / 2;
    for (let x = r.x0 + 4; x < r.x1 - 4; x += 6) {
      if ((x > H.x0 - 6 && x < H.x1 + 6) || (x > M.x0 - 6 && x < M.x1 + 6)) continue;
      flat(paint, x, zc, 3, 0.16);
    }
  }
  // manholes in the roads
  for (const r of [S, K]) {
    for (let x = r.x0 + 10; x < r.x1 - 6; x += 23 + rng.f() * 10) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), iron);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.03, r.z0 + 2.5 + rng.f() * (r.z1 - r.z0 - 5));
      m.updateMatrixWorld(true);
      b.add(m, { cast: false, receive: true });
    }
  }
  // a red post box at a few corners
  for (const [x, z] of [[-31, 21.5], [-17, 6.6], [79, 6.6], [-31, -17.4], [65, -17.4]] as const) {
    const k = kit(b, x, z, 0);
    k.cyl(col(0xc8281e, 0.5), 0, 0.62, 0, 0.27, 1.24);
    k.cyl(col(0xc8281e, 0.5), 0, 1.27, 0, 0.3, 0.08);
    k.box(col(0x1a1a1a, 0.6), 0, 0.98, 0.26, 0.3, 0.05, 0.04);
    k.done();
    b.collideBox(x, z, 0.6, 0.6, 1.3, { mapKind: 'prop', tag: 'postbox', surface: 'metal' });
  }
  // bollards across the arcade's mouths onto the cross streets (gaps to walk through)
  const steel = b.mats.get('steel');
  for (const ex of [ZONES.shotengaiW.x1 + 0.6, ZONES.shotengaiM.x0 - 0.6, ZONES.shotengaiM.x1 + 0.6, ZONES.shotengaiE.x0 - 0.6]) {
    for (const z of [ARCADE.z0 + 1, ARCADE.z1 - 1]) {
      const k = kit(b, ex, z, 0);
      k.cyl(steel, 0, 0.45, 0, 0.09, 0.9);
      k.cyl(col(0xd8a020, 0.5), 0, 0.72, 0, 0.095, 0.1);
      k.done();
    }
  }
}
