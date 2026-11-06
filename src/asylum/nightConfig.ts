/**
 * Blackwood Hill by day and by night: every number the Asylum's time of day, its story and its black fog use. Pure
 * data (no THREE, no DOM): the browser game and the co-op simulation read the same values.
 *
 * The run has no deadline. It is a story in steps (`story.ts`): the light holds at late afternoon until Ward Nine's
 * register is read, then the sun goes (DUSK, 40 s) and the Matron walks (NIGHT). The black fog leaves the crematorium
 * in waves (`FOG`) until someone shuts its damper. Calling the helicopter starts the DAWN: the sky pales over the
 * extraction countdown and the bird lands at first light.
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
 * The Asylum's mission clock (replaces `MISSION.deadline / surgeStart / phases` on this map): no deadline and no
 * spreading front. The black fog comes in waves instead (`FOG`, `story.ts`), and the run lasts as long as the story.
 */
export const ASYLUM_CLOCK = {
  deadline: Infinity,
  surgeStart: Infinity,
  /** Escalation by the clock (the story's own pressure rides on top: the fog waves, the night). */
  phases: [150, 420, 780] as readonly number[],
};

/**
 * The black fog: it rolls out of the crematorium stack in waves, drives the infected ahead of it, and burns anyone
 * caught in it. Each wave rises, holds and falls back; later waves reach further. Shutting the furnace's damper ends
 * them for good (the fog falls back over `stopFall` seconds).
 */
export const FOG = {
  /** The first wave (elapsed seconds), and the time between one wave's start and the next. */
  first: 210,
  period: 170,
  /** Warned this long before each wave. */
  warn: 15,
  /** Seconds rising, holding at full reach, falling back. */
  rise: 18,
  hold: 30,
  fall: 20,
  /** Reach (m from the stack) of the first wave, added per wave after it, and the most any wave reaches. */
  reach0: 36,
  reachStep: 8,
  reachMax: 70,
  /** After the damper is shut. */
  stopFall: 8,
  /** While a wave is out: the infected come this much faster, and this many more at once (the fog drives them). */
  rateMul: 2.2,
  capBonus: 10,
  /** Damage per second inside it (ignores armour). */
  dps: 9,
};

/** The story's rewards (cash for each step done, on top of the files), and the damper's hold. */
export const STORY = {
  /** Hold E at the furnace damper. */
  damperHold: 3,
  damperReach: 2.6,
  /** Paid when the damper is shut. */
  damperCash: 1500,
  /** Paid when the Matron is put down (on top of the hunt contract). */
  matronCash: 1000,
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
  /** Slower in the grey daylight: a few fewer, short-sighted, softer hits (the afternoon is long: there is work to do). */
  day: { hp: 1, damage: 0.8, speed: 0.85, sight: 0.7, count: 0.85 },
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
  /** Walk within this distance (m, horizontal; and on the same floor) to pick a file up. */
  pickupRadius: 1.9,
  /** Paid for each file, and once more when all of them are in. */
  cashEach: 500,
  bonus: 1500,
  /** In story order (`story.ts`): the nurses' floor and Ward Nine are the wards' upper floors (y 5). */
  spots: [
    { id: 'admin', x: -7.8, y: 0.8, z: 6.05, place: 'the admin offices' },
    { id: 'ward', x: -26, y: 0.06, z: -2.6, place: 'a west ward cell' },
    { id: 'nurses', x: -25.4, y: 5.85, z: -11.9, place: "the nurses' floor, upstairs in the west ward" },
    { id: 'nine', x: 22, y: 5.85, z: 4.5, place: 'Ward Nine, upstairs in the east ward' },
    { id: 'morgue', x: 25, y: 0.97, z: -31.3, place: 'the morgue' },
  ] as readonly RecordSpot[],
};

/** The wards' upper floors: their floor height and the fire escapes up from the yard (`world/layout/asylum.ts`). */
export const UPSTAIRS = {
  y: 5,
  /** Each wing's fire escape: the foot of the stairs (x, z), climbing toward -Z to the landing by the upper door. */
  west: { x: -13.55, z: -11.6, doorZ: -19.3 },
  east: { x: 13.55, z: -11.6, doorZ: -19.3 },
};

/** Radio and banner beats (elapsed seconds). */
export const NIGHT_BEATS = {
  /** Dr. Okafor sends you to the admin offices after the opening briefing. */
  recordsAsk: 12,
};
