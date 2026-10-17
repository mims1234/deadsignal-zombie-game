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
export type MapId = 'district' | 'sakura' | 'forge' | 'asylum';
export const MAP_IDS: readonly MapId[] = ['district', 'sakura', 'forge', 'asylum'];
/**
 * Maps the admins open to everyone from the dashboard (the server's `GATED_MAPS`). Until then only admins see and play
 * them (a local dev build shows them too); everyone else does not see them at all.
 */
export const GATED_MAPS: readonly MapId[] = ['sakura'];

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
    tagline: 'The same streets at blossom dusk, an anime cast',
    defenseTitle: 'RESTORE THE RELAY',
    defenseSite: 'RELAY',
    defensePrompt: 'ACTIVATE TRANSMITTER',
    defenseStart: 'UPLINK ACTIVE',
    defenseDone: 'RELAY RESTORED',
    huntTitle: 'DEFEAT THE CRIMSON EMPRESS',
    boss: 'THE CRIMSON EMPRESS',
    huntSite: 'the research compound',
    extractTitle: 'EXTRACT AT LZ ECHO',
    lz: 'LZ ECHO',
    surge: 'CONTAMINATION SURGE',
    hazardSite: 'SPIRE',
    sealed: 'DISTRICT SEALED IN',
    bossSighted: 'she has turned. Aim for the head.',
    bossRadio: { from: 'HANA', text: "That's her - the Empress. She hits like a truck. Head shots, and don't let her close." },
    regions: { low: 'Blossom streets', medium: 'Industrial depot - armored infected sighted', high: 'Contaminated research compound' },
    brief: "Hanabi unit, we're in. Restore the depot relay and put the Crimson Empress down. Aoi, Mei and Koharu are holed up somewhere out there - get them out and they'll fight with us. Then we call the bird at LZ Echo.",
    kicker: 'SECTOR 7  //  BLOSSOM DUSK  //  HANABI UNIT',
    signal: 'NO CARRIER  -  LAST KNOWN POSITION: RESEARCH COMPOUND',
    premise: 'The district under the cherry trees has been sealed for nine days. Deploy with Hana and Yuzu, clear two contracts, free the girls trapped in the blossom quarter and get out before the surge takes the landing zone.',
    foot: 'Two Hanabi girls deploy with you and can fall. Three survivors wait to be freed. Fewer infected than the District, and every one of them was someone.',
    rows: [
      { tag: 'CONTRACT ALPHA', title: 'RESTORE THE RELAY', text: 'Activate the depot transmitter and hold the marked area while the uplink completes.' },
      { tag: 'CONTRACT BRAVO', title: 'DEFEAT THE EMPRESS', text: 'Find and put down the Crimson Empress inside the research compound.' },
      { tag: 'EXTRACT', title: 'LZ ECHO', text: 'Radio the helicopter, survive the final horde and board with your squad.' },
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
