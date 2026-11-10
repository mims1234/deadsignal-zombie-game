/**
 * Zones: a large map split into districts of scenery, of which only the one the player stands in and its neighbours are
 * drawn. A zone is a rectangle and the list of zones that can be seen from it. The rule here is pure; `ZoneSwitch` applies
 * it to the groups the level builder made (`LevelBuilder.zone`, `LevelBuilder.zones`).
 *
 * Weak devices are bound by how many separate things are drawn, not by how big the map is, so this is what lets a map
 * several times the size of the others cost no more than one of its zones.
 */
import type * as THREE from 'three';

export interface Zone<Id extends string = string> {
  id: Id;
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** The zones drawn along with this one. */
  near: readonly Id[];
  /** From inside this zone a neighbour is drawn only within this many metres of it (default: the caller's reach). A building deep enough to hide the street sets it short. */
  reach?: number;
  /**
   * A building inside this zone that hides some neighbours: while the player stands within its rectangle, each zone in
   * `of` is drawn only within `reach` metres (the street outside the building keeps the zone's own reach).
   */
  inside?: { x0: number; z0: number; x1: number; z1: number; reach: number; of: readonly Id[] };
}

/** How near a neighbour `n` must be to be drawn from (x, z) in zone `cur`. */
function reachOf<Id extends string>(cur: Zone<Id>, n: Id, at: { x: number; z: number }, reach: number): number {
  const r = Math.min(reach, cur.reach ?? reach);
  const b = cur.inside;
  return b && b.of.includes(n) && at.x >= b.x0 && at.x < b.x1 && at.z >= b.z0 && at.z < b.z1 ? Math.min(r, b.reach) : r;
}

/** The zone a point is in, or null outside them all. */
export function zoneAt<Id extends string>(zones: readonly Zone<Id>[], x: number, z: number): Zone<Id> | null {
  for (const q of zones) if (x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1) return q;
  return null;
}

/**
 * The zone the player is in now, given the one they were in: they stay in the old one until they are `margin` metres
 * inside another, so standing on a boundary does not flick scenery on and off.
 */
export function zoneNow<Id extends string>(zones: readonly Zone<Id>[], prev: Id | null, x: number, z: number, margin = 2): Id | null {
  const cur = prev ? zones.find((q) => q.id === prev) : undefined;
  if (cur && x >= cur.x0 - margin && x < cur.x1 + margin && z >= cur.z0 - margin && z < cur.z1 + margin) return cur.id;
  return zoneAt(zones, x, z)?.id ?? prev;
}

/** How far (x, z) is from a zone's rectangle (0 inside it). */
export function zoneDistance(q: Zone, x: number, z: number): number {
  return Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1));
}

/**
 * What is drawn while the player is in `id`: that zone, and each neighbour that is within `reach` metres of where
 * they stand (every neighbour, without a position). Everything, when in no zone.
 */
export function zonesDrawn<Id extends string>(zones: readonly Zone<Id>[], id: Id | null, at?: { x: number; z: number }, reach = 75): Set<Id> {
  const out = new Set<Id>();
  const cur = id ? zones.find((q) => q.id === id) : undefined;
  if (!cur) {
    for (const q of zones) out.add(q.id);
    return out;
  }
  out.add(cur.id);
  for (const n of cur.near) {
    const q = zones.find((k) => k.id === n);
    if (q && (!at || zoneDistance(q, at.x, at.z) <= reachOf(cur, n, at, reach))) out.add(n);
  }
  return out;
}

/** Shows and hides the builder's zone groups as the player moves. */
export class ZoneSwitch<Id extends string = string> {
  current: Id | null = null;
  private drawn = new Set<Id>();

  constructor(
    private readonly zones: readonly Zone<Id>[],
    private readonly groups: ReadonlyMap<string, THREE.Object3D>,
  ) {}

  /** Everything drawn again (free roam, a cinematic, the end of a run). */
  showAll(): void {
    this.current = null;
    this.drawn = new Set(this.zones.map((q) => q.id));
    for (const g of this.groups.values()) g.visible = true;
  }

  /** Call every frame with where the player is. Returns true when what is drawn changed. */
  update(x: number, z: number): boolean {
    const now = zoneNow(this.zones, this.current, x, z);
    // a neighbour comes into the drawing a little before it could be seen through the snow, and leaves a little after
    const next = zonesDrawn(this.zones, now, { x, z }, 80);
    const cur = this.zones.find((k) => k.id === now);
    for (const id of this.drawn) if (!next.has(id) && now === this.current && cur) { const q = this.zones.find((k) => k.id === id); if (q && zoneDistance(q, x, z) <= Math.min(92, reachOf(cur, id, { x, z }, 80) + 12)) next.add(id); }
    let same = now === this.current && next.size === this.drawn.size;
    if (same) for (const id of next) if (!this.drawn.has(id)) same = false;
    if (same && this.drawn.size > 0) return false;
    this.current = now;
    this.drawn = next;
    for (const [id, g] of this.groups) g.visible = this.drawn.has(id as Id);
    return true;
  }

  isDrawn(id: Id): boolean {
    return this.drawn.has(id);
  }

  /** How many of the zones are drawn now (for the debug line and the tests). */
  get count(): number {
    return this.drawn.size;
  }
}
