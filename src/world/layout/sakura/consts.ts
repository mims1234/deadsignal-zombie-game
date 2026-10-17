/**
 * The Sakura District's layout, seven springs after the fall: where everything is. North is -Z (the top of the map),
 * east is +X. The street map is 256 x 132 m; the underground spaces (the metro, the theatre's lab, Kisaragi) are built
 * south of it, out of sight, and joined to it by stairwells (`floors.ts`).
 *
 *   Kita-dori (north road)        z -26 .. -16
 *   the shotengai (covered arcade) z -16 .. 8   (north shops, the arcade lane z -8 .. -1, south shops)
 *   Sakura-dori (the avenue)      z 8 .. 20
 *   Hillside-dori (north-south)   x -29 .. -19
 *   Kamotsu-dori (to the freight) x 67 .. 77, north of the avenue
 */
export const SAKURA_BOUNDS = { minX: -128, maxX: 128, minZ: -66, maxZ: 66 };
/** Everything there is: the street map, the underground spaces south of it, and Kisaragi beyond them. */
export const SAKURA_SPACE = { minX: -128, maxX: 128, minZ: -66, maxZ: 300 };

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const ROADS = {
  kita: { x0: -128, z0: -26, x1: 128, z1: -16, name: 'KITA-DORI' },
  sakura: { x0: -128, z0: 8, x1: 128, z1: 20, name: 'SAKURA-DORI' },
  hillside: { x0: -29, z0: -66, x1: -19, z1: 66, name: 'HILLSIDE-DORI' },
  kamotsu: { x0: 67, z0: -66, x1: 77, z1: 8, name: 'KAMOTSU-DORI' },
} as const;

/** The six zones (the blocks between the roads). */
export const ZONES = {
  school: { x0: -128, z0: -66, x1: -29, z1: -26 },
  theatre: { x0: -19, z0: -66, x1: 67, z1: -26 },
  freight: { x0: 77, z0: -66, x1: 128, z1: -26 },
  shotengaiW: { x0: -128, z0: -16, x1: -29, z1: 8 },
  shotengaiM: { x0: -19, z0: -16, x1: 67, z1: 8 },
  shotengaiE: { x0: 77, z0: -16, x1: 128, z1: 8 },
  station: { x0: -128, z0: 20, x1: -29, z1: 66 },
  canal: { x0: -19, z0: 20, x1: 128, z1: 66 },
} as const satisfies Record<string, Rect>;

/** The arcade lane through the shotengai (covered). */
export const ARCADE = { z0: -8, z1: -1, roofY: 6.2 };

/** Mission sites. */
export const SITES = {
  start: { x: -104, z: 30 },
  /** The helipad on the school's sports field. */
  lz: { x: -60, z: -44, radius: 9, terminalX: -48, terminalZ: -36 },
  /** The relay at the shrine (the defense: hold the courtyard). */
  defense: { x: 100, z: 50, radius: 14 },
  /** The Crimson Empress's courtyard, before the theatre. */
  boss: { x: 20, z: -40, searchX: 20, searchZ: -44, searchRadius: 24 },
  /** The pagoda in the theatre's garden: the surge rises from here. */
  hazard: { x: 55, z: -56 },
} as const;

/** The canal: water between stone banks, east-west through the south of the district. */
export const CANAL = { x0: -14, x1: 74, z0: 30, z1: 37, waterY: -1.1 };

/** The shrine on its hill, and its courtyard (the defense site). */
export const SHRINE = { x0: 74, z0: 38, x1: 126, z1: 64, hallX: 112, hallZ: 46 };

/** Underground: the metro (concourse, platform, tunnel), the lab under the theatre, and Kisaragi far beyond. */
export const UNDER = {
  metro: { x0: -118, z0: 150, x1: 70, z1: 182 },
  lab: { x0: 80, z0: 150, x1: 124, z1: 182 },
  kisaragi: { x0: -120, z0: 220, x1: 120, z1: 296 },
} as const;
