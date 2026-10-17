/**
 * The Sakura District, seven springs after the fall: its own map (no longer the District's streets). Builds the ground,
 * the six zones and the underground, and hands back what the mission, the story and the Easter egg need.
 */
import type { SpireHandle, TransmitterHandle } from '../../landmarks';
import type { Ctx } from '../util';
import { buildCanal, CANAL_KIOSK, type CanalInfo } from './canal';
import { CANAL, type Rect, SITES } from './consts';
import { buildFreight, type FreightInfo } from './freight';
import { buildSakuraGround } from './ground';
import { buildSchool, type SchoolInfo } from './school';
import { buildShotengai, SHOTENGAI_KIOSK, type ShotengaiInfo } from './shotengai';
import { buildStation, STATION_KIOSK } from './station';
import { buildTheatre, LAB_KIOSK, type TheatreInfo } from './theatre';
import { buildUnderground, UNDER_FEET, underAreas, type UnderAreas, type UnderInfo } from './underground';

export { SAKURA_BOUNDS, SAKURA_SPACE, SITES as SAKURA_SITES } from './consts';

export interface SakuraHandles {
  transmitter: TransmitterHandle;
  spire: SpireHandle;
  areas: UnderAreas;
  school: SchoolInfo;
  shotengai: ShotengaiInfo;
  canal: CanalInfo;
  theatre: TheatreInfo;
  freight: FreightInfo;
  under: UnderInfo;
}

/** The inside of a stairwell kiosk (`stairwellDown`), where the ground is left open for the steps going down. */
function kioskHole(k: { x: number; z: number; yaw: number }): Rect {
  const c = Math.cos(k.yaw);
  const s = Math.sin(k.yaw);
  const pts = [
    [-1.55, -0.1],
    [1.55, -0.1],
    [-1.55, -4.05],
    [1.55, -4.05],
  ].map(([lx, lz]) => [k.x + lx! * c + lz! * s, k.z - lx! * s + lz! * c] as const);
  return { x0: Math.min(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), z1: Math.max(...pts.map((p) => p[1])) };
}

export function buildSakura(c: Ctx): SakuraHandles {
  const areas = underAreas(c);
  const holes: Rect[] = [{ x0: CANAL.x0, z0: CANAL.z0, x1: CANAL.x1, z1: CANAL.z1 }, ...[STATION_KIOSK, SHOTENGAI_KIOSK, CANAL_KIOSK, LAB_KIOSK].map(kioskHole)];
  buildSakuraGround(c, holes);
  const metro = (f: { x: number; z: number; yaw: number }) => ({ area: areas.metro, ...f });
  buildStation(c, metro(UNDER_FEET.station));
  const school = buildSchool(c);
  const shotengai = buildShotengai(c, metro(UNDER_FEET.shotengai));
  const canal = buildCanal(c, metro(UNDER_FEET.canal));
  const theatre = buildTheatre(c, { area: areas.lab, ...UNDER_FEET.lab });
  const freight = buildFreight(c);
  const under = buildUnderground(c);
  void SITES;
  return { transmitter: canal.transmitter, spire: theatre.spire, areas, school, shotengai, canal, theatre, freight, under };
}
