/** Gameplay-facing description of the level (positions of stations, crates, spawn points, contract sites...). */
import type { ForgeSites } from '../../forge/sites';
import type { Region, ZombieType } from '../../types';
import type { MapData } from '../../ui/hudTypes';

export interface StationDef {
  id: string;
  kind: 'buy' | 'upgrade';
  name: string;
  x: number;
  z: number;
  /** Yaw of the model (front faces the player). */
  yaw: number;
  region: Region;
}

export interface CrateDef {
  id: string;
  x: number;
  z: number;
  yaw: number;
  region: Region;
}

export type SpawnGroup = 'general' | 'lz' | 'defense';

export interface SpawnPoint {
  x: number;
  z: number;
  region: Region;
  group: SpawnGroup;
  /** Relative preference. */
  weight: number;
}

export interface AmbientZombieDef {
  x: number;
  z: number;
  type: Exclude<ZombieType, 'warden'>;
  region: Region;
}

/** `sakura` is the District's streets with an anime cast (VRoid models, `anime/`). */
export type MapId = 'district' | 'sakura' | 'forge' | 'asylum' | 'aurelia' | 'mujin';
export const MAP_IDS: readonly MapId[] = ['district', 'sakura', 'forge', 'asylum', 'aurelia', 'mujin'];
/**
 * Maps the admins open to everyone from the dashboard (the server's `GATED_MAPS`). Until then only admins see and play
 * them (a local dev build shows them too); everyone else does not see them at all.
 */
export const GATED_MAPS: readonly MapId[] = ['sakura', 'aurelia', 'mujin'];

/** A valid map id from anything (storage, a URL, a message); unknown means the District. */
export function asMapId(v: unknown): MapId {
  return (MAP_IDS as readonly unknown[]).includes(v) ? (v as MapId) : 'district';
}

/** Everything the mission says out loud that depends on the map. */
export interface MapText {
  name: string;
  /** One line under the map's name on the title screen. */
  tagline: string;
  defenseTitle: string;
  /** Short map / compass label of the defense site. */
  defenseSite: string;
  defensePrompt: string;
  defenseStart: string;
  defenseDone: string;
  huntTitle: string;
  boss: string;
  huntSite: string;
  extractTitle: string;
  lz: string;
  surge: string;
  hazardSite: string;
  /** The mission clock's label. */
  sealed: string;
  /** When the boss is identified: the banner line and the radio call. */
  bossSighted: string;
  bossRadio: { from: string; text: string };
  regions: Record<Region, string>;
  /** Opening radio line. */
  brief: string;
  /** Title-screen copy. */
  kicker: string;
  signal: string;
  premise: string;
  foot: string;
  /** Title-screen brief: three rows. */
  rows: { tag: string; title: string; text: string }[];
}

export const MAP_TEXT: Record<MapId, MapText> = {
  district: {
    name: 'THE DISTRICT',
    tagline: 'Quarantined city blocks at blue hour',
    defenseTitle: 'RESTORE THE RELAY',
    defenseSite: 'RELAY',
    defensePrompt: 'ACTIVATE TRANSMITTER',
    defenseStart: 'UPLINK ACTIVE',
    defenseDone: 'RELAY RESTORED',
    huntTitle: 'ELIMINATE THE WARDEN',
    boss: 'THE WARDEN',
    huntSite: 'the research compound',
    extractTitle: 'EXTRACT AT LZ ECHO',
    lz: 'LZ ECHO',
    surge: 'CONTAMINATION SURGE',
    hazardSite: 'SPIRE',
    sealed: 'DISTRICT SEALED IN',
    bossSighted: 'heavily armored. Aim for the head.',
    bossRadio: { from: 'COMMAND', text: "That's him. Heavy plating - go for the head and watch for the slam." },
    regions: { low: 'Outer streets', medium: 'Industrial depot - armored infected sighted', high: 'Contaminated research compound' },
    brief: 'Insertion confirmed. Two contracts: restore the depot relay and eliminate the Warden. Three civilians are caged in out there - free them and they will fight. Then radio for extraction at LZ Echo.',
    kicker: 'SECTOR 7  //  QUARANTINE PERIMETER  //  BLUE HOUR',
    signal: 'NO CARRIER  -  LAST KNOWN POSITION: RESEARCH COMPOUND',
    premise: 'The district has been sealed for nine days. Insert at the checkpoint, clear two contracts, call the bird, and get out before the surge takes the landing zone.',
    foot: 'Crack mystery boxes for guns, ammo and grenades, buy gear and upgrade along the way. Free the trapped survivors. A contamination surge closes in late in the mission.',
    rows: [
      { tag: 'CONTRACT ALPHA', title: 'RESTORE THE RELAY', text: 'Activate the depot transmitter and hold the marked area while the uplink completes.' },
      { tag: 'CONTRACT BRAVO', title: 'ELIMINATE THE WARDEN', text: 'Locate and kill the elite infected inside the research compound.' },
      { tag: 'EXTRACT', title: 'LZ ECHO', text: 'Radio the helicopter, survive the final horde and board before the district seals.' },
    ],
  },
  sakura: {
    name: 'SAKURA DISTRICT',
    tagline: 'Seven springs after the fall, the blossoms took the city back',
    defenseTitle: 'RESTORE THE SHRINE RELAY',
    defenseSite: 'SHRINE',
    defensePrompt: 'ACTIVATE TRANSMITTER',
    defenseStart: 'UPLINK ACTIVE',
    defenseDone: 'RELAY RESTORED',
    huntTitle: 'DEFEAT THE CRIMSON EMPRESS',
    boss: 'THE CRIMSON EMPRESS',
    huntSite: 'the Kurenai Theatre',
    extractTitle: 'EXTRACT AT LZ HILLTOP',
    lz: 'LZ HILLTOP',
    surge: 'CONTAMINATION SURGE',
    hazardSite: 'PAGODA',
    sealed: 'DISTRICT SEALED IN',
    bossSighted: 'she has turned. Aim for the head.',
    bossRadio: { from: 'HANA', text: "That's her - the Empress. She hits like a truck. Head shots, and don't let her close." },
    regions: { low: 'Blossom streets', medium: 'Shotengai and canal - the lanes are crowded', high: 'Kurenai Court ground - armed humans, and worse' },
    brief: "Hanabi unit, we're in. Seven years of silence, and last night a signal woke up at the shrine. Restore the relay there, put down whatever the Kurenai Court made of the Empress at the old theatre, and we call the bird at the hilltop. Nobody is left to save in here.",
    kicker: 'SAKURAGI  //  SEVENTH SPRING  //  HANABI UNIT',
    signal: 'SHRINE RELAY TRANSMITTING  -  SOURCE UNKNOWN',
    premise: 'Seven springs after the fall, the cherry trees own Sakuragi. Deploy with Hana and Yuzu, clear two contracts and get out before the surge takes the landing zone. Read what the city left behind.',
    foot: 'Hana and Yuzu deploy with you; co-op players take their places. Nobody is left to save: only the infected, and the Kurenai Court, who shoot back.',
    rows: [
      { tag: 'CONTRACT ALPHA', title: 'RESTORE THE SHRINE RELAY', text: 'Activate the transmitter in the shrine grounds and hold the courtyard while the uplink completes.' },
      { tag: 'CONTRACT BRAVO', title: 'DEFEAT THE EMPRESS', text: 'Find and put down the Crimson Empress at the Kurenai Theatre.' },
      { tag: 'EXTRACT', title: 'LZ HILLTOP', text: 'Radio the helicopter, survive the final horde and board with your squad.' },
    ],
  },
  forge: {
    name: 'THE FORGE',
    tagline: 'Vulcan HQ, a foundry district at ember night',
    defenseTitle: 'REKINDLE THE BEACON',
    defenseSite: 'BEACON',
    defensePrompt: 'IGNITE THE PHOENIX BEACON',
    defenseStart: 'BEACON IGNITED',
    defenseDone: 'THE BEACON BURNS',
    huntTitle: 'SLAY THE INFERNUS',
    boss: 'THE INFERNUS',
    huntSite: 'the Crucible',
    extractTitle: 'RISE FROM THE FORGE',
    lz: 'THE PAD',
    surge: 'FIRESTORM',
    hazardSite: 'FLUE',
    sealed: 'THE FORGE SEALS IN',
    bossSighted: 'burning plate over burning flesh. Aim for the head.',
    bossRadio: { from: 'COMMAND', text: "That's... that was one of them. The first one. Plating like a furnace door - go for the head, and stay clear of the slam." },
    regions: { low: 'The outer Forge', medium: 'The foundry quarter', high: 'The Crucible and the Spawn Hall' },
    kicker: 'VULCAN HQ  //  EMBER NIGHT  //  RISE FROM THE FORGE',
    signal: 'VULCAN HQ DARK  -  COLLECTION PAUSED AT ALL SEVEN FURNACES',
    premise: "Every currency in the Forge ran on embers - and seven days ago the collection stopped. The furnaces went cold, the clan blamed each other, and the fire with nowhere to go burned up the people who made it. Start in the Hearth, bring the holdouts home, relight the seven furnaces, rekindle the beacon, slay the Infernus - then hold the Hearth until the bird can land.",
    foot: "Two of Vulcan's own deploy with you and can die. Clear the infected off a holdout's door and they make for the Hearth. Four ledger pages and riry's Rumble Pit wait around the Forge. When you call the bird, the whole Forge comes for the Hearth.",
    brief: "Ember, Vulcan HQ went dark seven nights ago when the furnaces stopped collecting. You're in the Hearth - its sentry covers you there. People are barricaded in all over the Forge: clear their doors and they'll come to you. Relight the seven furnaces, rekindle the phoenix beacon, slay the Infernus, then call the bird and hold the Hearth.",
    rows: [
      { tag: 'SAFE ZONE', title: 'THE HEARTH', text: 'You start here: the walled yard round the helipad, a gate open in every wall. Its sentry cuts down anything that comes through, and the people you save take up shotguns there.' },
      { tag: 'CONTRACT ALPHA', title: 'REKINDLE THE BEACON', text: 'Ignite the phoenix beacon on the plaza and hold its circle while it catches. It opens the HQ vault.' },
      { tag: 'CONTRACT BRAVO', title: 'SLAY THE INFERNUS', text: 'The first of them walks the molten floor of the Crucible.' },
      { tag: 'THE SEVEN EMBERS', title: 'RELIGHT THE FOUNDRIES', text: 'Seven foundries around the Forge, one per currency. Go in, stoke the forge and hold the hall for 30 seconds while a horde comes for it.' },
      { tag: 'EXTRACT', title: 'HOLD THE HEARTH', text: 'Call the bird from the Pad, then hold the Hearth against everything the Forge sends. Board with whoever is left.' },
    ],
  },
  asylum: {
    // day and night: the hour and the day / night missions are in asylum/nightConfig.ts, the story in asylum/lore.ts
    name: 'THE ASYLUM',
    tagline: 'Blackwood Hill, from day into night',
    defenseTitle: 'RESTORE THE POWER',
    defenseSite: 'BOILER HOUSE',
    defensePrompt: 'START THE GENERATORS',
    defenseStart: 'GENERATORS SPINNING UP',
    defenseDone: 'POWER RESTORED',
    huntTitle: 'PUT DOWN THE MATRON',
    boss: 'THE MATRON',
    huntSite: 'the isolation block',
    extractTitle: 'HOLD UNTIL DAWN',
    lz: 'THE LAWN',
    surge: 'THE BLACK FOG',
    hazardSite: 'CREMATORIUM',
    sealed: 'THE GATES CLOSE IN',
    bossSighted: 'she will not stop for body shots. Aim for the face.',
    bossRadio: { from: 'OKAFOR', text: "That's her. That's Mourne. Don't let her scream - the whole ward comes when she does. Go for the face." },
    regions: { low: 'The front grounds', medium: 'The wards and the yard', high: 'Isolation, chapel and morgue - her rounds' },
    kicker: 'BLACKWOOD HILL  //  ASYLUM GROUNDS  //  DUSK TILL DAWN',
    signal: 'POWER OUT  -  LAST KNOWN POSITION: ISOLATION BLOCK',
    premise: 'Blackwood Hill took its last patient in 1961 and lost its last orderly forty days ago, the night the power failed. Go over the wall with two of Lantern team in the last grey hours of the afternoon: find the hospital\'s files and bring the lights back while the infected are sluggish. At nightfall they wake - and so does the woman who still does the rounds.',
    foot: 'Close quarters: two ward wings, a walled yard, a chapel and a morgue. Vance and Dr. Okafor walk with you and can die. The asylum nurses, its chaplain and its last patient are still locked in. Day turns to night: after dark the infected are faster and there are more of them, and the black fog seeps from the crematorium late in the night.',
    brief: 'Lantern team, you are inside the walls and the light is going. While it lasts, get the boiler house generators running and find the Lantern Program files. At nightfall the Matron starts her round in the isolation block - put her down, then hold the lawn until the bird can land at first light. Its nurses and its last patient are still locked in - let them out and they will fight.',
    rows: [
      { tag: 'DAY', title: 'RECOVER THE RECORDS', text: 'Three Lantern Program files lie in the admin offices, a west ward cell and the morgue. Find them while it is light.' },
      { tag: 'DAY', title: 'RESTORE THE POWER', text: 'Start the boiler house generators and hold the yard while they spin up.' },
      { tag: 'NIGHT', title: 'PUT DOWN THE MATRON', text: 'At lights-out she wakes in the isolation block and begins her round. She has never missed one.' },
      { tag: 'DAWN', title: 'HOLD UNTIL DAWN', text: 'Radio from the lawn and hold it until first light, when the bird can land - before the black fog reaches the gate.' },
    ],
  },
  // Aurelia's valley: a round river valley, terraces climbing to the Phoenix Shrine (layout/aurelia.ts)
  aurelia: {
    name: 'AURELIA',
    tagline: 'Higan, the other shore: a valley of terraces under the equinox moon',
    defenseTitle: 'POWER THE RIVER RELAY',
    defenseSite: 'RELAY',
    defensePrompt: 'POWER THE RELAY',
    defenseStart: 'RELAY CHARGING',
    defenseDone: 'RELAY ONLINE',
    huntTitle: 'PUT DOWN THE SHRINE KEEPER',
    boss: 'THE SHRINE KEEPER',
    huntSite: 'the Phoenix Shrine',
    extractTitle: 'EXTRACT FROM THE WEST BANK',
    lz: 'WEST BANK',
    surge: 'BLACK BLOOM',
    hazardSite: 'BLOOM',
    sealed: 'THE RIVER CLOSES IN',
    bossSighted: 'it guards the shrine. Aim for the head.',
    bossRadio: { from: 'ATHY', text: "That's what's been keeping the shrine. It won't stay down easy - go for the head." },
    regions: { low: 'The riverbank', medium: 'The terraces - the infected hold the high ground', high: 'The Phoenix Shrine' },
    brief: "We're across. The infected dragged our people up the terraces. Power the river relay, put down whatever is keeping the shrine, cut ours loose, then call the bird to the west bank.",
    kicker: 'HIGAN  //  THE OTHER SHORE  //  EQUINOX NIGHT',
    signal: 'VULCAN CHANNEL OPEN  -  LAST CONTACT: THE PHOENIX SHRINE',
    premise: 'Black spider lilies have taken the valley, and the infected here will not stay down. Vulcan has crossed the river for its own. Climb the terraces, hold the relay, take the shrine, and bring everyone back across.',
    foot: 'Three terraces climb to a shrine on the summit: fight up the steps, or hold the high ground and shoot down. Athy and piryriry cross with you. Vulcan people are caged on the riverbank. The black bloom spreads from the back of the valley late in the night.',
    rows: [
      { tag: 'RELAY', title: 'POWER THE RIVER RELAY', text: 'Start the relay on the east bank and hold it while it charges.' },
      { tag: 'SHRINE', title: 'PUT DOWN THE SHRINE KEEPER', text: 'Climb the Lantern Terrace and the Shrine Steps to the Phoenix Shrine on the summit.' },
      { tag: 'EXTRACT', title: 'THE WEST BANK', text: 'Radio the bird and hold the west bank until it lands.' },
    ],
  },
  // MUJIN, the unmanned station: a night that repeats until the station is in order (layout/mujin.ts, src/mujin/)
  mujin: {
    name: 'MUJIN',
    tagline: 'The unmanned station: a dead stop on no map, three minutes before dawn',
    defenseTitle: 'GET THE STATION RUNNING',
    defenseSite: 'LAMPS',
    defensePrompt: 'THE LAMP BOARD',
    defenseStart: 'THE STATION STIRS',
    defenseDone: 'THE STATION IS RUNNING',
    huntTitle: 'STOP THE STATIONMASTER',
    boss: 'THE STATIONMASTER',
    huntSite: 'platform 1',
    extractTitle: 'BOARD THE DAWN TRAIN',
    lz: 'PLATFORM 1',
    surge: 'THE NIGHT',
    hazardSite: 'TUNNEL',
    sealed: 'THE NIGHT NEVER ENDS',
    bossSighted: 'he keeps the station. With every lamp lit he can be stopped.',
    bossRadio: { from: 'PA', text: 'Tickets, please. The first train will not run until the station does.' },
    regions: { low: 'The station', medium: 'Outside the station - the dark is closer here', high: 'The shrine on the hill' },
    brief: 'We fell asleep on the last train and woke at a dead station that is not on the map. Five jobs get it running again, and every one lights a lamp by the bell. Five lamps and the first train comes. The night will not wait.',
    kicker: 'MUJIN  //  THE LAST SERVICE  //  04:57',
    signal: 'NO SERVICE  -  FIRST TRAIN: WHEN THE STATION RUNS',
    premise: 'A rural stop taken off the maps when its tunnel fell in, dead since. Wind its clock, power its crossing, return its lost tickets, retie its shrine rope and make its announcement - while the night takes it piece by piece - and the dawn train will come for you.',
    foot: 'Five jobs, any order, each a lamp on the board by the bell: the clock (its key is in the tunnel), the crossing (three breakers, then hold the road), the lost tickets (into the gates), the shrine rope (a long hold), the announcement (hold the hall). The night takes an area each time its clock runs out; every job winds it back. Five lamps: stop the Stationmaster, then catch the dawn train.',
    rows: [
      { tag: 'JOBS', title: 'GET THE STATION RUNNING', text: 'Five jobs, any order. Each lights a lamp on the board by the bell.' },
      { tag: 'NIGHT', title: 'STOP THE STATIONMASTER', text: 'He walks platform 1. Until every lamp is lit, nothing stops him.' },
      { tag: 'DAWN', title: 'BOARD THE DAWN TRAIN', text: 'It stops at platform 1. Get on before the doors close.' },
    ],
  },
};

export interface LevelData {
  id: MapId;
  text: MapText;
  /** The street map (the minimap, the director). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** All the space anyone can be in: the street map, plus underground spaces built beside it (`floors.ts`). */
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  playerStart: { x: number; z: number; yaw: number };
  stations: StationDef[];
  crates: CrateDef[];
  spawnPoints: SpawnPoint[];
  ambient: AmbientZombieDef[];
  /** Defense contract: transmitter site. */
  defense: { x: number; z: number; radius: number };
  /** Hunt contract: where the Warden idles and the drawn search area. */
  hunt: { wardenX: number; wardenZ: number; searchX: number; searchZ: number; searchRadius: number };
  extraction: {
    lzX: number;
    lzZ: number;
    /** Radius within which the extraction may be called. */
    lzRadius: number;
    /** Radio terminal. */
    terminalX: number;
    terminalZ: number;
    terminalYaw: number;
    /** Helicopter touchdown centre and heading. */
    heliX: number;
    heliZ: number;
    heliYaw: number;
    /** Where the helicopter appears / departs (world XZ, high above). */
    heliFrom: { x: number; y: number; z: number };
  };
  /** Contamination source. */
  hazardCenter: { x: number; z: number };
  regionRects: { region: Region; x0: number; z0: number; x1: number; z1: number }[];
  map: MapData;
  /** The Forge's story sites: the safe rooms, the Hearth, the ledger pages, the Rumble Pit (`forge/sites.ts`). */
  forge?: ForgeSites;
}

export function regionAtRects(rects: LevelData['regionRects'], x: number, z: number): Region {
  for (const r of rects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.region;
  return 'low';
}

export function yawFacing(fx: number, fz: number): number {
  return Math.atan2(-fx, -fz);
}

/** Collects gameplay data while the level is being assembled. */
export class LevelDataBuilder {
  stations: StationDef[] = [];
  crates: CrateDef[] = [];
  spawnPoints: SpawnPoint[] = [];
  ambient: AmbientZombieDef[] = [];
  roads: MapData['roads'] = [];
  labels: MapData['labels'] = [];
  regionRects: LevelData['regionRects'] = [];

  station(def: Omit<StationDef, 'id'>): StationDef {
    const s = { ...def, id: `${def.kind}-${this.stations.filter((x) => x.kind === def.kind).length + 1}` };
    this.stations.push(s);
    return s;
  }

  crate(x: number, z: number, yaw: number, region: Region): void {
    this.crates.push({ id: `crate-${this.crates.length + 1}`, x, z, yaw, region });
  }

  spawn(region: Region, group: SpawnGroup, pts: [number, number][], weight = 1): void {
    for (const [x, z] of pts) this.spawnPoints.push({ x, z, region, group, weight });
  }

  zombies(region: Region, type: AmbientZombieDef['type'], pts: [number, number][]): void {
    for (const [x, z] of pts) this.ambient.push({ x, z, type, region });
  }

  road(x0: number, z0: number, x1: number, z1: number, name?: string): void {
    this.roads.push({ x0, z0, x1, z1, name });
  }

  label(text: string, x: number, z: number, size = 1): void {
    this.labels.push({ text, x, z, size });
  }
}
