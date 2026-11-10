/**
 * ZARYA, the DOM KULTURY: the Palace of Culture west of the square (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * Act II. Entered from the square through the Palace's doors (the east wall, at z = -23: the frame builds the
 * passage and the doors; three pageant tickets open them). Inside: the foyer, the town museum, the auditorium and
 * its stage, where Baba Yaga's hut stands on the revolve. The zone's rectangle is much bigger than the building:
 * the rest is the park behind it (snow, firs, a fence, a fountain), which is shut off and nobody reaches.
 *
 *   the foyer        the east end: straight in from the square along the red carpet, the chandelier, the New Year fir
 *                    south of it, the box office north of the way in, the cloakroom along the south wall
 *   the museum       the long room north of the foyer (a doorway from the foyer, another from the hall's cross aisle)
 *   the auditorium   west of the foyer through three doorways: two blocks of seats either side of the middle aisle,
 *                    a cross aisle half way down, the stage across the west end with its wings either side
 */
import { yawTo, type PeopleFn, type PersonRole, type Rect, type Spot } from '../types';

export const DK = {
  rect: { x0: -230, z0: -70, x1: -104, z1: 72 } as Rect,
  /** The building itself (walls, roof): the foyer at its east end, where the passage from the square comes in at (-104, -23). */
  building: { x0: -190, z0: -52, x1: -104, z1: 10 } as Rect,
  /** Everything lines up on this z: the way in from the square, the foyer's carpet, the hall's middle aisle, the hut. */
  axis: -23,
  /** The three rooms, by the inner faces of their walls. */
  foyerRoom: { x0: -135.8, z0: -39.8, x1: -104.8, z1: 9.5 } as Rect,
  museum: { x0: -159.8, z0: -51.5, x1: -104.8, z1: -40.2 } as Rect,
  hall: { x0: -189.5, z0: -39.8, x1: -136.2, z1: -6.2 } as Rect,
  /** In the foyer, on the carpet, under the chandelier's east side. */
  foyer: { x: -116, z: -23 } as Spot,
  /** The foyer's New Year fir (carol-singers stand round it). */
  fir: { x: -120.3, z: -8.5 } as Spot,
  /** The museum's north wall: the brass plaque with the year the town was founded (a clue, and the checkpoint's code), framed photographs with the first Ded Moroz among them (a clue). */
  plaque: { x: -124, z: -50.9 } as Spot,
  photo: { x: -134, z: -50.9 } as Spot,
  /** A glass case in the middle of the museum's floor with a sickle and a hammer (a heavy blow breaks it), and against the north wall the museum guard's locked cabinet with the Cossack sabre behind its grille (the spot is its front). */
  sickleCase: { x: -144, z: -46 } as Spot,
  cabinet: { x: -154, z: -50.5 } as Spot,
  /** The auditorium: the stage across its west end (boards 0.3 m up: walkers step onto it), the thrust in front of it, the hut on its revolve (6 m across), the lever on its stand in front of the south pier of the stage's arch (reached from the hall floor). */
  stage: { x0: -189.5, z0: -37, x1: -172, z1: -9 } as Rect,
  apron: { x0: -172, z0: -32, x1: -170.4, z1: -14 } as Rect,
  stageTop: 0.3,
  hut: { x: -180, z: -23 } as Spot,
  lever: { x: -171, z: -9 } as Spot,
  /** The seats: rows across the hall facing west, in two sections (the cross aisle between them) and two blocks (the middle aisle between them). `x` is a section's front row. */
  seats: {
    pitch: 1.4,
    sections: [{ x: -165.5, rows: 8 }, { x: -150.8, rows: 8 }],
    blocks: [{ z0: -36.6, z1: -24.6 }, { z0: -21.4, z1: -9.4 }],
  },
  /** Where a player stands in the hall to face the hut (the middle aisle), and a child stood in the cross aisle among the seats. */
  hallCentre: { x: -156, z: -23 } as Spot,
  cover: [{ x: -153.2, z: -14 }] as Spot[],
  /** Indoors: the infected come out of the wings (the front of each side aisle) and the cloakroom (behind its counter). */
  spawns: [[-168, -38.2], [-168, -7.8], [-112, 4], [-134.4, 6]] as [number, number][],
} as const;

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const dkPeople: PeopleFn = (add, r) => {
  // about forty: carol-singers in masks on the stage's edges and round the foyer's fir (role 'masked'), children in
  // costume, the audience on its feet among the seats, the queues at the cloakroom and the box office, the museum's visitors
  const hut = DK.hut;
  const top = DK.stageTop;
  const face = (x: number, z: number, tx: number, tz: number, role: PersonRole, solid = true, y = 0): void => add(x, z, yawTo(x, z, tx, tz) + (r() - 0.5) * 0.4, role, solid, y);
  for (const c of DK.cover) face(c.x, c.z, hut.x, hut.z, 'child');

  // ---- the stage: three singers at each edge of the boards, a child at each end of the thrust, two on the floor below (nobody within 5 m of the hut) ----
  for (const s of [-1, 1]) {
    const z0 = DK.axis + s * 10.4;
    for (const [x, dz] of [[-176.2, 0], [-177.6, 1], [-174.9, 1.3]] as const) face(x, z0 + s * dz, -150, DK.axis, 'masked', true, top);
    face(-171.3, DK.axis + s * 7.6, -150, DK.axis + s * 4, 'child', true, top);
    face(-168.4, DK.axis + s * 5.2, hut.x, hut.z, 'child');
  }

  // ---- the auditorium: the audience, on its feet in the rows (the seats' own colliders keep walkers out: nobody here needs one) ----
  const S = DK.seats;
  const stood: Spot[] = [];
  for (let n = 0, tries = 0; n < 11 && tries < 200; tries++) {
    const sec = S.sections[Math.floor(r() * S.sections.length)]!;
    const blk = S.blocks[Math.floor(r() * S.blocks.length)]!;
    const x = sec.x + (1 + Math.floor(r() * (sec.rows - 1))) * S.pitch - 0.66;
    const z = blk.z0 + 0.7 + r() * (blk.z1 - blk.z0 - 1.4);
    if (stood.some((p) => Math.hypot(p.x - x, p.z - z) < 1.3)) continue;
    stood.push({ x, z });
    face(x, z, hut.x, hut.z, r() < 0.35 ? 'child' : 'towns', false);
    n++;
  }

  // ---- the foyer: singers and children in a ring round the fir, the cloakroom's queue and its attendant, the box office ----
  const F = DK.fir;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const d = i % 2 ? 2.9 : 3.3;
    face(F.x + Math.cos(a) * d, F.z + Math.sin(a) * d, F.x, F.z, i % 2 ? 'child' : 'masked');
  }
  for (const x of [-127.2, -122.4, -118.2, -116.8]) face(x, 0.9, x, 4, 'towns');
  face(-120, 3.7, -120, 0, 'staff');
  face(-109.4, -33, -106, -33, 'towns');
  face(-110.8, -33.3, -106, -33, 'child');

  // ---- the museum: a few looking at the town's model, the photographs, the cases; the attendant by the cabinet ----
  face(-126.4, -43.2, -126, -45.6, 'towns');
  face(-129.6, -45.8, -126, -45.6, 'child');
  face(-136.6, -49.7, -136.6, -52, 'towns');
  face(-146.7, -46.3, -144, -46, 'towns');
  face(-108.6, -45.2, -106, -46, 'towns');
  face(-157, -49.4, -150, -46, 'staff');
};
