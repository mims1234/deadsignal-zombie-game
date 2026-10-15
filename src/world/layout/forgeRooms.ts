/**
 * The Forge's safe rooms: small brick rooms someone barricaded themselves into. The front door is barred from inside
 * and solid (a collider nobody walks through, and no infected ever breaks), a barred window beside it shows the person
 * inside by the light of a lantern, and the door carries their note. They leave by the back (`forge/runtime.ts`).
 * Also the HQ vault, tomoe's, built into Vulcan HQ's hall.
 */
import * as THREE from 'three';
import type { SafeRoomDef } from '../../forge/sites';
import { addBox, building, type Side } from '../structures';
import { type Ctx } from './util';

/** A door the runtime can swing a little (they crack it open to talk), hinged on its left edge. */
export interface DoorHandle {
  pivot: THREE.Group;
  /** Yaw of the closed door. */
  yaw: number;
}

const SIDE_N: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

let doorMats: { slab: THREE.Material; plank: THREE.Material; note: THREE.Material; lantern: THREE.Material; bar: THREE.Material } | null = null;
function mats(): NonNullable<typeof doorMats> {
  doorMats ??= {
    slab: new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.85 }),
    plank: new THREE.MeshStandardMaterial({ color: 0x6b4b2e, roughness: 0.9 }),
    note: new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.95, emissive: 0x3a3428, emissiveIntensity: 0.4 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0xffa040, emissiveIntensity: 2.4, roughness: 0.4 }),
    bar: new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.7 }),
  };
  return doorMats;
}

/** The barred door in an opening of `width` centred at (x, z) in a wall facing yaw `yaw` (0 = facing +Z). */
function barredDoor(c: Ctx, x: number, z: number, yaw: number, width: number, nx: number, nz: number): DoorHandle {
  const { b } = c;
  const M = mats();
  // the leaf itself (animated: they crack it open), hinged on its left edge seen from outside
  const pivot = new THREE.Group();
  const hx = Math.cos(yaw);
  const hz = -Math.sin(yaw);
  pivot.position.set(x - hx * (width / 2 - 0.04), 0, z - hz * (width / 2 - 0.04));
  pivot.rotation.y = yaw;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, 2.18, 0.08), M.slab);
  slab.position.set(width / 2 - 0.04, 1.09, 0);
  slab.castShadow = true;
  pivot.add(slab);
  // planks nailed across it, and the note
  for (const [y, tilt] of [[0.55, 0.18], [1.25, -0.12], [1.85, 0.08]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.16, 0.05), M.plank);
    p.position.set(width / 2 - 0.04, y, 0.07);
    p.rotation.z = tilt;
    pivot.add(p);
  }
  const note = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.01), M.note);
  note.position.set(width / 2 + 0.1, 1.5, 0.1);
  note.rotation.z = 0.06;
  pivot.add(note);
  b.addDynamic(pivot);
  // solid: nobody gets through the front, in or out (the infected only try)
  b.collide({ x: x - nx * 0.05, z: z - nz * 0.05, hx: width / 2 + 0.12, hz: 0.3, rot: yaw, y1: 2.6, mapKind: 'wall', tag: 'safedoor', surface: 'wood' });
  return { pivot, yaw };
}

export interface SafeRoomSpec {
  id: string;
  place: string;
  x: number;
  z: number;
  w: number;
  d: number;
  /** The side the door (and the window beside it) is on. */
  door: Side;
  wall?: 'brick' | 'concreteDark' | 'corrugatedRust' | 'metalPanel' | 'plaster';
}

/** Build one safe room and say where everything is. */
export function safeRoom(c: Ctx, s: SafeRoomSpec, doors: DoorHandle[]): SafeRoomDef {
  const { b } = c;
  const M = mats();
  const t = 0.4;
  const x0 = s.x - s.w / 2;
  const x1 = s.x + s.w / 2;
  const z0 = s.z - s.d / 2;
  const z1 = s.z + s.d / 2;
  const [nx, nz] = SIDE_N[s.door];
  // along the door wall, left to right seen from outside
  const ax = -nz;
  const az = nx;
  const along = s.door === 'N' || s.door === 'S' ? s.w : s.d;
  const winOff = Math.min(1.7, along / 2 - 0.9);
  // world centre of the door and the window on that side
  const wallX = s.door === 'E' ? x1 - t / 2 : s.door === 'W' ? x0 + t / 2 : s.x;
  const wallZ = s.door === 'S' ? z1 - t / 2 : s.door === 'N' ? z0 + t / 2 : s.z;
  const winX = wallX + ax * winOff;
  const winZ = wallZ + az * winOff;
  // the `at` of a point on each side (see `structures.ts`: N from the west end, S from the east, E from the north, W from the south)
  const at = (px: number, pz: number): number => (s.door === 'N' ? px - x0 : s.door === 'S' ? x1 - px : s.door === 'E' ? pz - (z0 + t) : z1 - t - pz);
  building(b, {
    x: s.x,
    z: s.z,
    w: s.w,
    d: s.d,
    height: 3.2,
    wallMaterial: s.wall ?? 'brick',
    roofMaterial: 'roof',
    floorMaterial: 'floorWarehouse',
    ceilingMaterial: 'concreteDark',
    parapet: 0.3,
    sides: {
      [s.door]: {
        openings: [
          { at: at(wallX, wallZ), width: 1.3, height: 2.25, kind: 'door', frame: 'steelDark' },
          { at: at(winX, winZ), width: 1.0, height: 0.85, sill: 1.15, kind: 'window', barricade: true, frame: 'steelDark' },
        ],
      },
    },
    tag: `saferoom-${s.id}`,
  });
  const yaw = Math.atan2(nx, nz);
  doors.push(barredDoor(c, wallX, wallZ, yaw, 1.3, nx, nz));
  // bars across the window (shots go through, walkers do not: the window's own collider)
  for (let k = -2; k <= 2; k++) addBox(b, M.bar, winX + ax * k * 0.19, 1.575, winZ + az * k * 0.19, 0.035, 0.85, 0.035, 0, { cast: false });
  // inside: a lantern, a cot along the back wall, crates stacked by the door
  addBox(b, M.lantern, winX - nx * 0.7 - ax * 0.2, 1.05, winZ - nz * 0.7 - az * 0.2, 0.16, 0.24, 0.16, 0, { cast: false });
  b.light({ x: winX - nx * 0.9, y: 1.9, z: winZ - nz * 0.9, color: 0xffa050, intensity: 18, distance: 6, weight: 0.5 });
  const backX = s.x - nx * ((s.door === 'N' || s.door === 'S' ? s.d : s.w) / 2 - 0.9);
  const backZ = s.z - nz * ((s.door === 'N' || s.door === 'S' ? s.d : s.w) / 2 - 0.9);
  addBox(b, M.slab, backX - ax * (along / 2 - 1.3), 0.32, backZ - az * (along / 2 - 1.3), Math.abs(ax) * 1.9 + Math.abs(nx) * 0.8, 0.3, Math.abs(az) * 1.9 + Math.abs(nz) * 0.8, 0);
  addBox(b, 'crateWood', wallX - nx * 0.75 - ax * 0.95, 0.45, wallZ - nz * 0.75 - az * 0.95, 0.9, 0.9, 0.9, 0.3);
  // the back door: shut from inside (they leave this way)
  addBox(b, M.slab, backX - nx * 0.5, 1.1, backZ - nz * 0.5, Math.abs(ax) * 1.1 + Math.abs(nx) * 0.06, 2.1, Math.abs(az) * 1.1 + Math.abs(nz) * 0.06, 0, { cast: false });
  const inX = winX - nx * 0.85;
  const inZ = winZ - nz * 0.85;
  return {
    id: s.id,
    place: s.place,
    vault: false,
    doorX: wallX + nx * 1.0,
    doorZ: wallZ + nz * 1.0,
    nx,
    nz,
    ax,
    az,
    inX,
    inZ,
    inYaw: Math.atan2(-nx, -nz),
    backX,
    backZ,
  };
}

/**
 * tomoe's vault in the HQ hall's corner (inner rectangle `inner`): two partition walls, a barred door with a slot
 * window facing into the hall. Sealed until the beacon burns (`forge/story.ts`).
 */
export function hqVault(c: Ctx, inner: { x0: number; z0: number; x1: number; z1: number }, doors: DoorHandle[]): { def: SafeRoomDef; partitions: Parameters<typeof building>[1]['partitions'] } {
  const vx0 = inner.x1 - 5.6;
  const vz0 = inner.z1 - 5.4;
  const doorX = vx0 + 2.6;
  const winX = vx0 + 4.4;
  const partitions = [
    { x0: vx0, z0: vz0, x1: inner.x1, z1: vz0, material: 'steelDark' as const, thickness: 0.3, openings: [{ at: doorX - vx0, width: 1.3, height: 2.25, kind: 'door' as const, frame: 'steelDark' as const }, { at: winX - vx0, width: 0.9, height: 0.5, sill: 1.4, kind: 'window' as const, barricade: true, frame: 'steelDark' as const }] },
    { x0: vx0, z0: vz0, x1: vx0, z1: inner.z1, material: 'steelDark' as const, thickness: 0.3 },
  ];
  return {
    partitions,
    def: (() => {
      const M = mats();
      doors.push(barredDoor(c, doorX, vz0, Math.PI, 1.3, 0, -1));
      for (let k = -2; k <= 2; k++) addBox(c.b, M.bar, winX + k * 0.17, 1.65, vz0, 0.035, 0.5, 0.035, 0, { cast: false });
      addBox(c.b, M.lantern, winX - 0.3, 1.0, vz0 + 0.9, 0.16, 0.24, 0.16, 0, { cast: false });
      c.b.light({ x: winX - 0.4, y: 2, z: vz0 + 1.2, color: 0xffb060, intensity: 20, distance: 6, weight: 0.5 });
      return {
        id: 'vault',
        place: 'the HQ vault',
        vault: true,
        doorX,
        doorZ: vz0 - 1.0,
        nx: 0,
        nz: -1,
        ax: 1,
        az: 0,
        inX: winX - 0.2,
        inZ: vz0 + 1.0,
        inYaw: 0,
        backX: vx0 + 3.6,
        backZ: inner.z1 - 0.9,
      };
    })(),
  };
}
