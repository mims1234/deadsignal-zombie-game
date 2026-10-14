/** Gameplay-facing description of the level (positions of stations, crates, spawn points, contract sites...). */
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

export type MapId = 'district' | 'forge';

/** Everything the mission says out loud that depends on the map. */
export interface MapText {
  name: string;
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
  forge: {
    name: 'THE FORGE',
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
    regions: { low: 'Ember Market', medium: 'Phoenix Plaza - the forge hall', high: 'The Crucible - molten floor' },
    kicker: 'VULCAN HQ  //  EMBER NIGHT  //  RISE FROM THE FORGE',
    signal: 'VULCAN HQ DARK  -  LAST KNOWN POSITION: THE CRUCIBLE',
    premise: 'The infection reached Vulcan HQ. Members of the clan walk the foundry with their names still on them, and its leaders are caged in somewhere in the Forge. Deploy with Ash and Cinder, free the leadership, rekindle the beacon, slay the Infernus and rise before the firestorm.',
    foot: 'Two soldiers deploy with you and can die. tomoe, Anya, Marv03K and piryriry wait to be freed. Six Ignis embers burn somewhere in the Forge. A firestorm rises from the flue late in the mission.',
    brief: 'Ember squad, Vulcan HQ has fallen. Its leaders are caged in around the Forge - break them out and they will fight. Rekindle the phoenix beacon, slay the Infernus in the Crucible, keep Ash and Cinder breathing, then rise from the forge at the Pad.',
    rows: [
      { tag: 'CONTRACT ALPHA', title: 'REKINDLE THE BEACON', text: 'Ignite the phoenix beacon on the plaza and hold the circle while it catches.' },
      { tag: 'CONTRACT BRAVO', title: 'SLAY THE INFERNUS', text: 'The burning elite walks the molten floor of the Crucible.' },
      { tag: 'EXTRACT', title: 'RISE FROM THE FORGE', text: 'Signal the bird at the Pad, hold out, and board before the firestorm takes the district.' },
    ],
  },
};

export interface LevelData {
  id: MapId;
  text: MapText;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
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
