/**
 * Where the Forge's story happens, as the layout (`world/layout/forge*.ts`) builds it: the safe rooms the holdouts
 * barricaded themselves into, the Hearth (where the run starts: open, a sentry in the middle), the ledger pages, the
 * Rumble Pit, the cold furnaces around the Forge, the furnace under HQ. Plain data (no THREE), shared by the solo game,
 * the co-op simulation and every client.
 */

/** A room someone locked themselves into. Its door is solid: nobody (and nothing) walks in or out of the front. */
export interface SafeRoomDef {
  id: string;
  /** Short place name for the HUD and the map: "the ledger office". */
  place: string;
  /** tomoe's: the HQ vault, sealed until the beacon burns. */
  vault: boolean;
  /** Outside the door, where you stand to talk them out (and where the infected pound). */
  doorX: number;
  doorZ: number;
  /** The door wall's outward normal, and its direction along the wall. */
  nx: number;
  nz: number;
  ax: number;
  az: number;
  /** Where the person stands inside (by the window, looking out), and the yaw they face. */
  inX: number;
  inZ: number;
  inYaw: number;
  /** The back way out (inside, by the far wall): where they go when they leave. */
  backX: number;
  backZ: number;
}

export interface HearthDef {
  /** The courtyard's centre, and the open gate on its Pad side (`gateZ` just outside it). */
  x: number;
  z: number;
  gateX: number;
  gateZ: number;
  /** Inside the walls. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** The sentry gun in the middle. */
  sentryX: number;
  sentryZ: number;
  /** Where the people you save stand, and the way each faces. */
  slots: { x: number; z: number; yaw: number }[];
}

/** A small furnace out in the Forge, cold since the collection stopped; seven of them are drawn each run. */
export interface FurnaceSpot {
  x: number;
  z: number;
  /** The way its mouth faces (where you stand to stoke it). */
  yaw: number;
  place: string;
}

export interface LedgerSpot {
  x: number;
  y: number;
  z: number;
  place: string;
}

export interface RumblePitDef {
  x: number;
  z: number;
  radius: number;
  bellX: number;
  bellZ: number;
  /** Where each wave comes in. */
  gates: { x: number; z: number }[];
}

export interface ForgeSites {
  /** Every safe room; the vault is one of them (`vault: true`). */
  rooms: SafeRoomDef[];
  hearth: HearthDef;
  ledger: LedgerSpot[];
  rumble: RumblePitDef;
  /** Every furnace that can be drawn (`FORGE_STORY.furnaces.count` of them each run). */
  furnaces: FurnaceSpot[];
  /** The Great Furnace under Vulcan HQ (its door faces `yaw`): the reveal starts here. */
  furnace: { x: number; z: number; yaw: number };
  /** Vulcan HQ's roof (the billboard): the reveal tears through it. */
  hq: { x: number; z: number; roofY: number };
}
