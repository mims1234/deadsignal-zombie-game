/**
 * First-person viewmodels: five procedurally built rigs (KR-16 rifle, VX-9 pistol, PS-12 shotgun, frag grenade throw and
 * armour plate application), each with gloved hands and forearms, animated entirely from a `ViewmodelPose`.
 * See `./viewmodel/` for the geometry kit, hands, materials, muzzle flash and per-weapon rigs, and
 * `./viewmodelTypes.ts` for the contract.
 */
import { createGrenade } from './viewmodel/grenade';
import { acquireTextures, releaseTextures } from './viewmodel/materials';
import { createPistol } from './viewmodel/pistol';
import { createPlate } from './viewmodel/plate';
import { createHanafubuki, createRaijin } from './viewmodel/relics';
import { createRifle } from './viewmodel/rifle';
import { createRpg } from './viewmodel/rpg';
import { createShotgun } from './viewmodel/shotgun';
import { ZARYA_RIGS } from './viewmodel/zarya';
import type { ViewmodelRig, ViewmodelSet } from './viewmodelTypes';
import { ZARYA_GUN_IDS } from '../logic/zaryaGuns';
import type { ZaryaGunId } from '../types';

export function createViewmodels(opts: { relics?: boolean; zarya?: boolean } = {}): ViewmodelSet {
  const tex = acquireTextures();
  const rifle = createRifle(tex);
  const pistol = createPistol(tex);
  const shotgun = createShotgun(tex);
  const rpg = createRpg(tex);
  const grenade = createGrenade(tex);
  const plate = createPlate(tex);
  const relics = opts.relics ? [createHanafubuki(tex), createRaijin(tex)] : [];
  // ZARYA's own guns, on that map only
  const zarya: Partial<Record<ZaryaGunId, ViewmodelRig>> = {};
  if (opts.zarya) for (const id of ZARYA_GUN_IDS) zarya[id] = ZARYA_RIGS[id](tex);
  let disposed = false;
  return {
    rifle,
    pistol,
    shotgun,
    rpg,
    grenade,
    plate,
    hanafubuki: relics[0],
    raijin: relics[1],
    ...zarya,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const r of [rifle, pistol, shotgun, rpg, grenade, plate, ...relics, ...Object.values(zarya)]) r.dispose();
      releaseTextures();
    },
  };
}
