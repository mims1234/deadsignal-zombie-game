/**
 * The emblem, marked all over the district: glowing sigils on building walls and shipping containers and stencilled
 * on the roads. Every mark is a quad in ONE merged mesh (a single draw call), placed by ray tests against the real
 * collision world so each one sits on an actual wall. Returns null when the emblem image is not in `art/`.
 */
import * as THREE from 'three';
import { Rng } from '../logic/rng';
import type { Level } from '../world/level';
import { emblemUrl } from './cardArt';

const TINT = 0xd8c4ff;
const GLOW = 0x9a6cff;

export async function createEmblemDecor(level: Level): Promise<THREE.Mesh | null> {
  const url = emblemUrl();
  if (!url) return null;
  const tex = await new THREE.TextureLoader().loadAsync(url).catch(() => null);
  if (!tex) return null;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const rng = new Rng(4177);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  /** Add a quad centred at `c`, spanned by the half-vectors `r` (image right) and `u` (image up). */
  const quad = (c: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3): void => {
    const base = pos.length / 3;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      pos.push(c.x + r.x * sx + u.x * sy, c.y + r.y * sx + u.y * sy, c.z + r.z * sx + u.z * sy);
      uv.push((sx + 1) / 2, (sy + 1) / 2);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // ---- walls: one mark per building / container face that really has a wall behind it ----
  const world = level.world;
  for (const f of level.data.map.footprints) {
    if (f.kind !== 'building' && f.kind !== 'container') continue;
    const building = f.kind === 'building';
    const cos = Math.cos(f.rot);
    const sin = Math.sin(f.rot);
    // local +X and +Z in world space (THREE rotation.y convention)
    const axes = [
      { nx: cos, nz: -sin, out: f.hx, wide: f.hz },
      { nx: -cos, nz: sin, out: f.hx, wide: f.hz },
      { nx: sin, nz: cos, out: f.hz, wide: f.hx },
      { nx: -sin, nz: -cos, out: f.hz, wide: f.hx },
    ];
    for (const a of axes) {
      const size = building ? Math.min(1.5, a.wide * 0.6) : Math.min(0.65, a.wide * 0.7);
      if (size < 0.45 || !rng.chance(building ? 0.75 : 0.5)) continue;
      const y = building ? 2.5 + rng.f() * 1.2 : 1.35;
      // slide along the face so the marks do not all sit dead centre
      const slide = (rng.f() - 0.5) * Math.max(0, a.wide - size) * 1.2;
      const ox = f.x + a.nx * (a.out + 2) - a.nz * slide;
      const oz = f.z + a.nz * (a.out + 2) + a.nx * slide;
      const hit = world.raycast(ox, y, oz, -a.nx, 0, -a.nz, 3.2, 'shots');
      if (!hit || !hit.collider || Math.abs(hit.ny) > 0.2) continue;
      const c = new THREE.Vector3(hit.x + hit.nx * 0.035, y, hit.z + hit.nz * 0.035);
      quad(c, new THREE.Vector3(hit.nz, 0, -hit.nx).multiplyScalar(size), new THREE.Vector3(0, size, 0));
    }
  }

  // ---- roads: a stencil every so often along each one ----
  for (const road of level.data.map.roads) {
    const along = road.x1 - road.x0 >= road.z1 - road.z0;
    const len = along ? road.x1 - road.x0 : road.z1 - road.z0;
    const width = along ? road.z1 - road.z0 : road.x1 - road.x0;
    const size = Math.min(2.2, width * 0.3);
    if (size < 0.8) continue;
    for (let d = 12 + rng.f() * 10; d < len - 8; d += 26 + rng.f() * 14) {
      const x = along ? road.x0 + d : (road.x0 + road.x1) / 2 + (rng.f() - 0.5) * width * 0.3;
      const z = along ? (road.z0 + road.z1) / 2 + (rng.f() - 0.5) * width * 0.3 : road.z0 + d;
      const yaw = rng.f() * Math.PI * 2;
      const r = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(size);
      const u = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(size);
      quad(new THREE.Vector3(x, 0.035, z), r, u);
    }
  }

  if (idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: TINT,
    emissive: GLOW,
    emissiveMap: tex,
    emissiveIntensity: 0.9,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Emblems';
  mesh.userData.count = idx.length / 6;
  return mesh;
}
