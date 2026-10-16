/**
 * Where the Forge's story happens, as the layout (`world/layout/forge*.ts`) builds it: the safe rooms the holdouts
 * barricaded themselves into, the Hearth (where the run starts: open, a sentry in the middle), the ledger pages, the
 * Rumble Pit, the seven foundries around the Forge, the furnace under HQ. Plain data (no THREE), shared by the solo game,
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
  /** The yard's centre (the helipad), and its main gate, the one the run starts facing (`gateZ` just outside it). */
  x: number;
  z: number;
  gateX: number;
  gateZ: number;
  /** Every gate (all standing open): the middle of its gap in the wall, and the wall's outward normal. */
  gates: { x: number; z: number; nx: number; nz: number }[];
  /** Inside the walls. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** The sentry gun, up on its tower: where it stands, and the height it turns at. */
  sentryX: number;
  sentryZ: number;
  sentryY: number;
  /** Where the people you save stand, and the way each faces. */
  slots: { x: number; z: number; yaw: number }[];
}

/**
 * One of the seven foundries: a brick hall with a cold forge inside, one per ember (`FORGE_SQUAD.flames` order). `x`/`z` is
 * where you stand to stoke the forge; the hall (inside its walls) is what you hold while it catches.
 */
export interface FurnaceSpot {
  x: number;
  z: number;
  /** The way the forge's mouth faces. */
  yaw: number;
  place: string;
  /** Inside the hall's walls. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Just outside its front door. */
  doorX: number;
  doorZ: number;
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
  /** The seven foundries, one per ember. */
  furnaces: FurnaceSpot[];
  /** The Great Furnace under Vulcan HQ (its door faces `yaw`): the reveal starts here. */
  furnace: { x: number; z: number; yaw: number };
  /** Vulcan HQ's roof (the billboard): the reveal tears through it. */
  hq: { x: number; z: number; roofY: number };
}
