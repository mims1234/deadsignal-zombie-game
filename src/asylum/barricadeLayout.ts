/**
 * Where the barricades are: read straight from the built level's colliders (every boarded window leaves one tagged
 * 'barricade', see `structures.ts`), so the map file stays the single source of truth. For each window this works out
 * which side is indoors, where an infected stands to tear the boards, where a climb lands inside and where infected
 * appear outside. Pure (no THREE / DOM): the co-op server can run it on its headless level.
 *
 * Window ids are the order of the colliders, which is the build order: identical on every client and on the server.
 */
import type { CollisionWorld } from '../world/collision';
import type { NavGrid } from '../world/nav';
import { BARRICADE } from './barricadeConfig';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface BarricadeDef {
  id: number;
  /** Window centre (middle of the wall). */
  x: number;
  z: number;
  /** Unit vector along the wall, and the outward normal (towards the grounds). */
  ax: number;
  az: number;
  nx: number;
  nz: number;
  /** Rotation of the wall (THREE rotation.y), the opening's width, sill and lintel heights, wall thickness. */
  rot: number;
  width: number;
  sill: number;
  top: number;
  thick: number;
  /** Where the infected tearing the boards stands (outside, facing in). */
  outX: number;
  outZ: number;
  /** Where a climb through lands (inside). */
  inX: number;
  inZ: number;
  /** Where infected sent to this window appear (outside, in the open). */
  spawnX: number;
  spawnZ: number;
  /** The building the window belongs to (its footprint). */
  building: Rect;
}

const inRect = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Every boarded window in the level, with its approach, landing and spawn points. */
export function findBarricades(world: CollisionWorld, nav: NavGrid): BarricadeDef[] {
  const footprints: Rect[] = [];
  for (const c of world.colliders) {
    if (c.tag === 'footprint') footprints.push({ x0: c.minX, z0: c.minZ, x1: c.maxX, z1: c.maxZ });
  }
  const free = (x: number, z: number, r = 0.42): boolean => !nav.isBlockedAt(x, z) && !world.circleBlocked(x, z, r, 0.05, 1.7);
  const out: BarricadeDef[] = [];
  for (const c of world.colliders) {
    if (c.tag !== 'barricade') continue;
    // collider local X runs along the wall, local Z across it
    const ax = c.cos;
    const az = -c.sin;
    let nx = c.sin;
    let nz = c.cos;
    // indoors is the side whose footprint holds a point a metre in
    let building = footprints.find((f) => inRect(f, c.cx - nx, c.cz - nz)) ?? null;
    if (!building) {
      nx = -nx;
      nz = -nz;
      building = footprints.find((f) => inRect(f, c.cx - nx, c.cz - nz)) ?? null;
    }
    if (!building) continue; // a window with no building behind it: not a barricade anyone can use
    const thick = c.hz * 2;
    const outD = c.hz + 0.55;
    // landing: just inside, slid along the inward normal / sideways past any furniture under the sill
    let inX = c.cx - nx * (c.hz + 0.8);
    let inZ = c.cz - nz * (c.hz + 0.8);
    search: for (const d of [0.8, 1.1, 1.4, 1.8]) {
      for (const s of [0, 0.4, -0.4, 0.8, -0.8]) {
        const x = c.cx - nx * (c.hz + d) + ax * s;
        const z = c.cz - nz * (c.hz + d) + az * s;
        if (free(x, z, 0.38)) {
          inX = x;
          inZ = z;
          break search;
        }
      }
    }
    // spawn: out in the open on a clear line back to the window
    const nearX = c.cx + nx * (c.hz + 1.0);
    const nearZ = c.cz + nz * (c.hz + 1.0);
    let spawnX = nearX + nx * 2;
    let spawnZ = nearZ + nz * 2;
    for (const d of BARRICADE.spawnOut) {
      const x = c.cx + nx * d;
      const z = c.cz + nz * d;
      if (!free(x, z, 0.5) || footprints.some((f) => inRect(f, x, z))) continue;
      if (!nav.los(x, z, nearX, nearZ)) continue;
      spawnX = x;
      spawnZ = z;
      break;
    }
    out.push({
      id: out.length,
      x: c.cx,
      z: c.cz,
      ax,
      az,
      nx,
      nz,
      rot: c.rot,
      width: c.hx * 2,
      sill: c.y0,
      top: c.y1,
      thick,
      outX: c.cx + nx * outD,
      outZ: c.cz + nz * outD,
      inX,
      inZ,
      spawnX,
      spawnZ,
      building,
    });
  }
  return out;
}

/** Which side of window `d` a point is on: > 0 outside, < 0 inside (metres from the wall's centre line). */
export function sideOf(d: BarricadeDef, x: number, z: number): number {
  return (x - d.x) * d.nx + (z - d.z) * d.nz;
}

/** Is (x, z) inside one of the buildings that has barricades? */
export function indoors(defs: readonly BarricadeDef[], x: number, z: number): boolean {
  for (const d of defs) if (inRect(d.building, x, z)) return true;
  return false;
}
