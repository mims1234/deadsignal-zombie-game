/**
 * Floors above and below: the walkable areas of a map that are not the street (a building's storeys and its roof,
 * underground concourses and tunnels) and the stairs and stairwells that join them.
 *
 * - **Area 0 is the ground** (the map's own nav grid). Every other area has a small nav grid of its own: an upper storey
 *   is walkable only over its floor slab (`ColliderSpec.floor` at its height), an underground space is ground-level
 *   space of its own, built outside the street map behind walls nobody sees, and joined to it by stairwells.
 * - **Links** join two areas: a flight of stairs (walked, step by step, the agent's height following the steps) or a
 *   stairwell (`teleport`: walk in at one end, come out at the other). A link's path runs from its lower end to its upper
 *   end.
 * - **Routing:** an infected in one area hunting someone in another asks `route` for the next link toward them, walks to
 *   its near end along that area's field (`fieldTo`), and crosses it (`traverse`).
 *
 * Everything here is deterministic from the level, so the co-op host and the server simulation agree.
 */
import { FlowField, GAMEPLAY_FIELD_RANGE, NavGrid } from './nav';
import type { CollisionWorld, WorldBoundsXZ } from './collision';

export interface FloorPoint {
  x: number;
  y: number;
  z: number;
}

export type AreaKind = 'ground' | 'upper' | 'under';

export interface FloorArea {
  id: number;
  name: string;
  kind: AreaKind;
  /** Height of its floor. */
  y: number;
  rect: WorldBoundsXZ;
  /** Its own nav grid (null for the ground, which uses the map's). */
  nav: NavGrid | null;
}

export interface FloorLink {
  id: number;
  /** Area at the path's start (the lower end) and at its end (the upper end). */
  lower: number;
  upper: number;
  /** From the lower end to the upper end. */
  path: FloorPoint[];
  /** A stairwell: walk in at one end, come out at the other (the two ends are far apart in the world). */
  teleport: boolean;
  /** Cumulative path length at each point. */
  lengths: number[];
  /** Shut for now: nobody routes through it (the ghost train, until the bloom). */
  closed: boolean;
  /** Taken on purpose (an interaction), never by walking into its end. */
  manual: boolean;
}

/** The minimal infected the traversal moves (`Zombie` implements it). */
export interface Traveller {
  x: number;
  z: number;
  yaw: number;
  area: number;
  /** Put it somewhere (height drawn there at once). */
  placeAt(x: number, y: number, z: number, yaw: number): void;
}

const MAX_FIELDS = 48;

export class Floors {
  readonly areas: FloorArea[] = [];
  readonly links: FloorLink[] = [];
  /** Links leaving each area. */
  private readonly adj: number[][] = [];
  private groundNav: NavGrid | null = null;
  /** Static fields to fixed points (link ends), by "area:cell"; recently used last. */
  private readonly fields = new Map<string, FlowField>();
  /** Per area: a field toward a moving target (whoever is being hunted there) and the cell it was computed for. */
  private readonly live = new Map<number, { field: FlowField; cell: number }>();

  constructor(groundRect: WorldBoundsXZ) {
    this.areas.push({ id: 0, name: 'street', kind: 'ground', y: 0, rect: { ...groundRect }, nav: null });
    this.adj.push([]);
  }

  /** A storey, a roof or an underground space; returns its id. Build the grids with `build` once every collider is in. */
  addArea(name: string, kind: Exclude<AreaKind, 'ground'>, y: number, rect: WorldBoundsXZ): number {
    const id = this.areas.length;
    this.areas.push({ id, name, kind, y, rect: { ...rect }, nav: null });
    this.adj.push([]);
    return id;
  }

  /** Stairs (or a stairwell) from `lower` to `upper`; `path` runs from the lower end to the upper end. */
  addLink(lower: number, upper: number, path: FloorPoint[], teleport = false, opts: { closed?: boolean; manual?: boolean } = {}): FloorLink {
    const lengths = [0];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      lengths.push(lengths[i - 1]! + (teleport ? 0 : Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)));
    }
    const link: FloorLink = { id: this.links.length, lower, upper, path: path.map((p) => ({ ...p })), teleport, lengths, closed: opts.closed ?? false, manual: opts.manual ?? false };
    this.links.push(link);
    this.adj[lower]!.push(link.id);
    this.adj[upper]!.push(link.id);
    return link;
  }

  get hasFloors(): boolean {
    return this.areas.length > 1;
  }

  /** Build every area's nav grid (call after the level's colliders are all in). */
  build(world: CollisionWorld, groundNav: NavGrid): void {
    this.groundNav = groundNav;
    world.stackedFloors = this.hasFloors;
    for (const a of this.areas) {
      if (a.kind === 'ground') continue;
      a.nav = new NavGrid(a.rect, world, 0.42, a.kind === 'upper' ? { yBase: a.y, floorsOnly: true } : {});
    }
  }

  /** The nav grid an agent in an area moves on. */
  navOf(area: number): NavGrid {
    return this.areas[area]?.nav ?? this.groundNav!;
  }

  /**
   * Which area a point is in: an underground space by where it is, a storey by where it is and how high (the highest
   * storey at or under the point's height), else the street.
   */
  areaAt(x: number, y: number, z: number): number {
    let best = 0;
    let bestY = -Infinity;
    for (let i = 1; i < this.areas.length; i++) {
      const a = this.areas[i]!;
      const r = a.rect;
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      if (a.kind === 'under') return i;
      if (y >= a.y - 0.9 && a.y > bestY) {
        best = i;
        bestY = a.y;
      }
    }
    return best;
  }

  /** The next link to take from area `from` toward area `to` (breadth-first over the links), or null when none joins them. */
  route(from: number, to: number): FloorLink | null {
    if (from === to) return null;
    const n = this.areas.length;
    const prevLink = new Int32Array(n).fill(-1);
    const seen = new Uint8Array(n);
    const queue = [to];
    seen[to] = 1;
    // search from the goal back, so the first link out of `from` falls out directly
    while (queue.length) {
      const a = queue.shift()!;
      for (const li of this.adj[a]!) {
        const l = this.links[li]!;
        if (l.closed) continue;
        const b = l.lower === a ? l.upper : l.lower;
        if (seen[b]) continue;
        seen[b] = 1;
        prevLink[b] = li;
        if (b === from) return this.links[li]!;
        queue.push(b);
      }
    }
    return null;
  }

  /**
   * Roughly how far it is to walk from (x, z) in one area to (tx, tz) in another: straight lines through each link's ends
   * on the way. An underground space is built far off to the side, so a straight line there means nothing.
   */
  walkDistance(from: number, x: number, z: number, to: number, tx: number, tz: number): number {
    let d = 0;
    let area = from;
    for (let hop = 0; hop < 8 && area !== to; hop++) {
      const l = this.route(area, to);
      if (!l) return Infinity;
      const a = this.endIn(l, area);
      d += Math.hypot(a.x - x, a.z - z) + (l.teleport ? 3 : l.lengths[l.lengths.length - 1]!);
      area = area === l.lower ? l.upper : l.lower;
      const b = this.endIn(l, area);
      x = b.x;
      z = b.z;
    }
    return d + Math.hypot(tx - x, tz - z);
  }

  /** The end of a link in a given area (its lower end in `lower`, its upper end in `upper`). */
  endIn(link: FloorLink, area: number): FloorPoint {
    return area === link.lower ? link.path[0]! : link.path[link.path.length - 1]!;
  }

  /** A field toward a fixed point in an area (a link's end), built once and kept (the oldest dropped past a cap). */
  fieldTo(area: number, x: number, z: number): FlowField | null {
    const nav = this.navOf(area);
    const cell = nav.nearestFree(x, z, 8);
    if (cell < 0) return null;
    const key = `${area}:${cell}`;
    let f = this.fields.get(key);
    if (f) {
      this.fields.delete(key);
      this.fields.set(key, f);
      return f;
    }
    f = new FlowField(nav);
    f.compute(nav.cellCenterX(cell), nav.cellCenterZ(cell), area === 0 ? GAMEPLAY_FIELD_RANGE * 1.4 : Infinity);
    this.fields.set(key, f);
    if (this.fields.size > MAX_FIELDS) this.fields.delete(this.fields.keys().next().value!);
    return f;
  }

  /** A field toward someone moving about inside a storey or an underground space (recomputed when they change cell). */
  liveField(area: number, x: number, z: number): FlowField | null {
    if (area === 0) return null;
    const nav = this.navOf(area);
    const cell = nav.nearestFree(x, z, 8);
    if (cell < 0) return null;
    let e = this.live.get(area);
    if (!e) {
      e = { field: new FlowField(nav), cell: -1 };
      this.live.set(area, e);
    }
    if (e.cell !== cell) {
      e.cell = cell;
      e.field.compute(nav.cellCenterX(cell), nav.cellCenterZ(cell));
    }
    return e.field;
  }

  /** The point `s` metres along a link's path (from its lower end). */
  pointAt(link: FloorLink, s: number, out: FloorPoint): FloorPoint {
    const p = link.path;
    const L = link.lengths;
    if (s <= 0) return Object.assign(out, p[0]!);
    for (let i = 1; i < p.length; i++) {
      if (s <= L[i]!) {
        const a = p[i - 1]!;
        const b = p[i]!;
        const k = (s - L[i - 1]!) / Math.max(1e-6, L[i]! - L[i - 1]!);
        out.x = a.x + (b.x - a.x) * k;
        out.y = a.y + (b.y - a.y) * k;
        out.z = a.z + (b.z - a.z) * k;
        return out;
      }
    }
    return Object.assign(out, p[p.length - 1]!);
  }

  /**
   * Cross a link from area `from`: a flight of stairs is walked at `speed` (call every frame until it returns false), a
   * stairwell puts the traveller at the far end at once. Returns true while still on the way.
   */
  traverse(t: Traveller, link: FloorLink, from: number, progress: { s: number }, speed: number, dt: number): boolean {
    const up = from === link.lower;
    const to = up ? link.upper : link.lower;
    if (link.teleport) {
      const end = up ? link.path[link.path.length - 1]! : link.path[0]!;
      const next = up ? link.path[link.path.length - 2] : link.path[1];
      // come out facing away from the stairwell
      const yaw = next ? Math.atan2(-(end.x - next.x), -(end.z - next.z)) : t.yaw;
      t.placeAt(end.x, end.y, end.z, yaw);
      t.area = to;
      return false;
    }
    const total = link.lengths[link.lengths.length - 1]!;
    progress.s = Math.min(total, progress.s + speed * dt);
    const s = up ? progress.s : total - progress.s;
    const p = this.pointAt(link, s, scratch);
    const ahead = this.pointAt(link, up ? Math.min(total, s + 0.4) : Math.max(0, s - 0.4), scratch2);
    const yaw = Math.hypot(ahead.x - p.x, ahead.z - p.z) > 1e-3 ? Math.atan2(-(ahead.x - p.x), -(ahead.z - p.z)) : t.yaw;
    t.placeAt(p.x, p.y, p.z, yaw);
    if (progress.s >= total) {
      t.area = to;
      return false;
    }
    return true;
  }

  /**
   * Where walking in takes you through a stairwell from `area`: just inside its doorway (the point after its out-point),
   * not the out-point in front of it that the infected head for.
   */
  entryIn(link: FloorLink, area: number): FloorPoint {
    if (!link.teleport) return this.endIn(link, area);
    return area === link.lower ? link.path[1]! : link.path[link.path.length - 2]!;
  }

  /** The stairwell whose doorway in `area` is within `radius` of (x, z), if any (someone walking into one). */
  stairwellAt(area: number, x: number, z: number, radius: number): FloorLink | null {
    for (const li of this.adj[area] ?? []) {
      const l = this.links[li]!;
      if (!l.teleport || l.manual || l.closed) continue;
      const e = this.entryIn(l, area);
      if (Math.hypot(e.x - x, e.z - z) <= radius) return l;
    }
    return null;
  }

  /** Where coming through a stairwell from `from` puts you: the far end's out-point, facing away from the stairs. */
  exitOf(link: FloorLink, from: number): { x: number; y: number; z: number; yaw: number; area: number } {
    const up = from === link.lower;
    const end = up ? link.path[link.path.length - 1]! : link.path[0]!;
    const next = up ? link.path[link.path.length - 2]! : link.path[1]!;
    return { x: end.x, y: end.y, z: end.z, yaw: Math.atan2(-(end.x - next.x), -(end.z - next.z)), area: up ? link.upper : link.lower };
  }
}

const scratch: FloorPoint = { x: 0, y: 0, z: 0 };
const scratch2: FloorPoint = { x: 0, y: 0, z: 0 };
