/**
 * The Asylum's buyable doors in the physical world (no THREE): one collider per doorway in the CollisionWorld and the
 * matching cells of the NavGrid. A shut door blocks the player, the AI squad, the infected and (unless it is an iron
 * gate) bullets and sight; opening it switches its collider off and re-rasterises the nav cells around it, so the next
 * flow field paths through. The level is built with every door open; the loop shuts them at the start of a run.
 */
import type { BoxCollider, CollisionWorld } from '../world/collision';
import type { NavGrid } from '../world/nav';
import { ASYLUM_DOORS, type DoorDef } from './loopData';

/** Half the thickness of a door's collider (walls are 0.4 m; a door fills the opening and a little more). */
const HALF_THICK = 0.28;

/** The collider box of a doorway (centre, half extents, rotation), shared with the layout's sealed doorways. */
export function doorwayBox(d: { x: number; z: number; along: 'x' | 'z'; width: number }): { x: number; z: number; hx: number; hz: number; rot: number } {
  // a little wider than the opening, so it seats into the jambs
  return { x: d.x, z: d.z, hx: d.width / 2 + 0.12, hz: HALF_THICK, rot: d.along === 'x' ? 0 : Math.PI / 2 };
}

export class DoorWorld {
  readonly defs: readonly DoorDef[] = ASYLUM_DOORS;
  private readonly colliders: BoxCollider[] = [];
  private readonly open: boolean[] = [];
  /** Called after any door changed (the game refreshes the infected's flow field). */
  onChange: (() => void) | null = null;

  constructor(
    private readonly world: CollisionWorld,
    private readonly nav: NavGrid,
  ) {
    for (const d of this.defs) {
      const box = doorwayBox(d);
      const c = world.add({ ...box, y1: d.height + 0.4, mapKind: 'none', surface: d.kind === 'door' ? 'wood' : 'metal', tag: `door:${d.id}`, blocksMove: false, blocksShots: false });
      this.colliders.push(c);
      this.open.push(true);
    }
  }

  isOpen(i: number): boolean {
    return this.open[i] ?? true;
  }

  /** Open or shut one door (no-op when already so). */
  setOpen(i: number, open: boolean): void {
    const c = this.colliders[i];
    const d = this.defs[i];
    if (!c || !d || this.open[i] === open) return;
    this.open[i] = open;
    c.blocksMove = !open;
    c.blocksShots = !open && !d.seeThrough;
    const m = 1.2;
    this.nav.refresh(this.world, c.minX - m, c.minZ - m, c.maxX + m, c.maxZ + m);
    this.onChange?.();
  }

  /** Match a list of flags (1 open, 0 shut), e.g. the loop state's `doors`. */
  sync(flags: readonly number[]): void {
    for (let i = 0; i < this.defs.length; i++) this.setOpen(i, flags[i] === 1);
  }

  setAll(open: boolean): void {
    for (let i = 0; i < this.defs.length; i++) this.setOpen(i, open);
  }
}
