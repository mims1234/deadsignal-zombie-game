/**
 * Who is where on the Sakura District (the solo game and the co-op simulation both use it): what kind each infected
 * spawned in a zone becomes, the Kurenai Court's sentries on the container decks and round their fires, and the
 * stalker who comes for you once you have been in the district a while.
 */
import { sakuraVariant, type ZombieVariant } from '../enemies/variants';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { Level } from '../world/level';
import { ZONES } from '../world/layout/sakura/consts';

/** `ZombieManager.pickVariant` for the Sakura District: by the zone (and floor) an infected is spawned on. */
export function sakuraVariantPicker(level: Level): (type: ZombieType, x: number, z: number, y: number, rng: Rng) => ZombieVariant {
  const fl = level.floors;
  const kisaragi = level.sakura?.kisaragi.area ?? -1;
  return (type, x, z, y, rng) => {
    const area = fl.areaAt(x, y, z);
    const kind = fl.areas[area]?.kind;
    let zone = 'street';
    if (area === kisaragi) zone = 'kisaragi';
    else if (kind === 'under') zone = 'under';
    else {
      for (const [name, r] of Object.entries(ZONES)) {
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
          zone = name;
          break;
        }
      }
    }
    return sakuraVariant(type, { zone, raised: kind === 'upper' }, () => rng.f());
  };
}

/** A run's start: the Court's sentries up on the container decks and round the fires before the theatre. */
export function populateSakura(zm: ZombieManager, level: Level, rng: Rng): void {
  const h = level.sakura;
  if (!h) return;
  for (const d of h.freight.decks) {
    for (const dz of [0, 9]) zm.spawn('shambler', d.x, d.z + dz, rng, { ambient: true, y: d.y, area: d.area, variant: 'court', yaw: Math.PI });
  }
  for (const f of h.theatre.fires) {
    for (let i = 0; i < 2; i++) {
      const a = rng.f() * Math.PI * 2;
      zm.spawn('shambler', f.x + Math.cos(a) * 2.2, f.z + Math.sin(a) * 2.2, rng, { ambient: true, variant: 'court', yaw: a + Math.PI });
    }
  }
}

/** The stalker: after a while in the district she comes, from somewhere behind and out of sight. Once a run. */
export class Stalker {
  private t = 0;
  spawned = false;
  /** Seconds in before she comes. */
  static readonly AFTER = 110;

  reset(): void {
    this.t = 0;
    this.spawned = false;
  }

  /** Returns true the moment she is out there. */
  update(dt: number, zm: ZombieManager, level: Level, players: readonly { x: number; z: number; alive: boolean }[], rng: Rng): boolean {
    if (this.spawned) return false;
    this.t += dt;
    if (this.t < Stalker.AFTER) return false;
    const up = players.filter((p) => p.alive);
    if (up.length === 0) return false;
    // a spawn point 30-55 m from the nearest player, none of them able to see it
    const world = level.world;
    const ok = level.data.spawnPoints.filter((s) => {
      const d = Math.min(...up.map((p) => Math.hypot(p.x - s.x, p.z - s.z)));
      return d > 30 && d < 55 && up.every((p) => world.segmentBlocked(p.x, 1.6, p.z, s.x, 1.5, s.z, 'shots'));
    });
    if (ok.length === 0) return false;
    const s = ok[Math.floor(rng.f() * ok.length)]!;
    zm.spawn('runner', s.x, s.z, rng, { state: 'chase', variant: 'kuchisake' });
    this.spawned = true;
    return true;
  }
}
