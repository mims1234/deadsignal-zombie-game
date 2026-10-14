/**
 * Blackwood Hill by day and by night: every number the Asylum's time of day, its day / night missions and its mission
 * clock use. Pure data (no THREE, no DOM): the browser game and the co-op simulation read the same values, so both
 * agree on the time of day from the mission's elapsed seconds alone.
 *
 *   0 s ............ 300 s ...... 340 s ............................................. 900 s
 *   DAY (records, power)  DUSK      NIGHT (the Matron wakes, the bird, the black fog at 660 s)  the gates close
 *
 * Calling the helicopter starts the DAWN: the sky pales over the extraction countdown and the bird lands at first light.
 */

/** The cycle, in seconds of mission time. */
export const ASYLUM_CYCLE = {
  /** Late afternoon under an overcast sky: the infected are sluggish and few. */
  dayEnd: 300,
  /** The sun goes down behind the pines and the lamps come on. */
  duskLength: 40,
  /** From the extraction call to first light (matches the helicopter's countdown). */
  dawnLength: 60,
};

/** The elapsed second at which night falls (the Matron wakes, the hunt opens). */
export const NIGHTFALL = ASYLUM_CYCLE.dayEnd + ASYLUM_CYCLE.duskLength;

/**
 * The Asylum's mission clock (replaces `MISSION.deadline / surgeStart / phases` on this map). The night has to hold a
 * whole boss hunt and an extraction, so the run is longer than the District's 12 minutes and the black fog comes late.
 */
export const ASYLUM_CLOCK = {
  /** The gates close: last chance to call the bird. */
  deadline: 900,
  /** The black fog leaves the crematorium (warned 20 s before). */
  surgeStart: 660,
  /** Escalation: a little after the start, at nightfall, with the fog. */
  phases: [150, NIGHTFALL, 660] as readonly number[],
};

/** How the infected change with the light, multiplied on top of the chosen difficulty (1 = unchanged). */
export interface PhaseTuning {
  hp: number;
  damage: number;
  speed: number;
  sight: number;
  count: number;
}

export const PHASE_TUNING: { day: PhaseTuning; night: PhaseTuning } = {
  /** Sleepy in the grey daylight: fewer of them, slow, short-sighted, softer hits. */
  day: { hp: 1, damage: 0.8, speed: 0.8, sight: 0.65, count: 0.6 },
  /** After dark: more of them, faster, sharper-eyed, harder hitting. */
  night: { hp: 1, damage: 1.15, speed: 1.12, sight: 1.25, count: 1.3 },
};

/** How far the light has come back by first light (0 = full night tuning, 1 = full day). */
export const DAWN_RELIEF = 0.5;

/** The patient files (RECOVER THE RECORDS). Positions are on the Asylum layout (`world/layout/asylum.ts`). */
export interface RecordSpot {
  id: string;
  /** Where it lies (y is the height of the surface it rests on). */
  x: number;
  y: number;
  z: number;
  /** Short place name for the HUD and map. */
  place: string;
}

export const RECORDS = {
  /** Walk within this distance (m, horizontal) to pick a file up. */
  pickupRadius: 1.9,
  /** Paid for each file, and once more when all three are in. */
  cashEach: 300,
  bonus: 900,
  spots: [
    { id: 'admin', x: -7.8, y: 0.8, z: 6.05, place: 'the admin offices' },
    { id: 'ward', x: -26, y: 0.06, z: -2.6, place: 'a west ward cell' },
    { id: 'morgue', x: 25, y: 0.97, z: -31.3, place: 'the morgue' },
  ] as readonly RecordSpot[],
};

/** Radio and banner beats (elapsed seconds). */
export const NIGHT_BEATS = {
  /** Dr. Okafor asks for the files after the opening briefing. */
  recordsAsk: 14,
  /** "The sun is going down." */
  duskWarning: ASYLUM_CYCLE.dayEnd - 45,
};
