/**
 * Tuning for the Asylum's boarded windows (barricades): how fast the infected tear them down, how fast players nail
 * them back up, what that pays and how many director spawns come in through the windows. Kept out of `src/config.ts`.
 */
export const BARRICADE = {
  /** Boards across every window. */
  boards: 6,
  /** Seconds for one infected to rip one board off (runners are quicker, armoured slower: see `tearRate`). */
  tearTime: 1.0,
  /** Tear speed multiplier by infected type. */
  tearRate: { shambler: 1, runner: 1.35, armored: 0.8, warden: 2 } as Record<string, number>,
  /** Seconds of holding E per board nailed back. */
  repairTime: 0.6,
  /** Cash per board, and the most a player earns from boards over time (a token bucket that refills at
   * `payCap / payWindow` dollars a second up to `payCap`): stops anyone farming a window a zombie keeps opening. */
  repairPay: 10,
  payCap: 60,
  payWindow: 45,
  /** How close (m) to a window's inside face a player must be to repair it. */
  repairReach: 2.1,
  /** Share of the director's spawns that come in through a window while the player is indoors. */
  spawnShare: 0.6,
  /** Windows further than this (m, straight line) from the player are not used for spawns. */
  spawnRange: 34,
  /** Infected allowed at (or queuing for) one window at once. */
  queueMax: 3,
  /** Distance (m) the outside spawn sits from the window, tried from the first value down. */
  spawnOut: [7, 6, 5, 4, 3.2] as readonly number[],
  /** Scripted climb through an open window (s). */
  climbTime: 1.25,
  /** Window sill height (m) the climb goes over (matches the Asylum's windows). */
  sill: 1.1,
  /** A zombie at the window swipes a player standing this close inside it (m), every `swipeEvery` s. */
  swipeReach: 1.45,
  swipeEvery: 1.5,
  /** Fraction of the infected's melee damage a swipe through the window does. */
  swipeDamage: 0.6,
  /** Walking to the window: give up (back to the normal AI) after this long without getting there (s). */
  approachTimeout: 14,
  /** The infected leaves its window to chase a player who is outside and this close (m) with a clear line. */
  breakOffRange: 6,
} as const;
