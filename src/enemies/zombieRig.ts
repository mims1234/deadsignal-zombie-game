/**
 * Zombie rig factory: procedural, skinned, animated infected humans (shambler, runner, armored, warden).
 * See `zombie/` for the body builders, garments, gear, animation and rig implementation.
 */
import * as THREE from 'three';
import { ZOMBIES } from '../config';
import type { ZombieType } from '../types';
import { createDetailTexture, createZombieMaterial } from './zombie/material';
import { disposeShapeCache } from './zombie/mesh';
import { type TypeAssets, ZombieRigImpl, makeTypeAssets, variantGeometry } from './zombie/rig';
import { AnimeZombieRig, hordeModel } from '../anime/cast';
import { MatronRig } from './matronRig';
import { hasModel } from '../models/library';
import { ModelZombieRig } from '../models/zombieRig';
import type { ZombieFactory, ZombieRig, ZombieTheme } from './zombieRigTypes';
import type { ZombieVariant } from './variants';

export interface ZombieFactoryExt extends ZombieFactory {
  /** Bake every appearance variant now (avoids a few ms of hitching on first spawn of each variant); with a theme, its looks instead. */
  prewarm(theme?: ZombieTheme): void;
  /** The Asylum's boss, the Matron. */
  createMatron(seed: number): ZombieRig;
  /** Shared material (debug / harness). */
  readonly material: THREE.MeshStandardMaterial;
}

export function createZombieFactory(): ZombieFactoryExt {
  const texture = createDetailTexture();
  const material = createZombieMaterial(texture);
  const assets = new Map<string, TypeAssets>();
  const rigs = new Set<ZombieRig>();
  const get = (type: ZombieType, theme?: ZombieTheme): TypeAssets => {
    const key = theme ? `${type}:${theme}` : type;
    let a = assets.get(key);
    if (!a) {
      a = makeTypeAssets(type, theme);
      assets.set(key, a);
    }
    return a;
  };
  return {
    material,
    create(type: ZombieType, seed: number, theme?: ZombieTheme, variant: ZombieVariant = ''): ZombieRig {
      const def = ZOMBIES[type];
      const dims = { radius: def.radius, height: def.height, headRadius: def.headRadius };
      const anime = theme === 'sakura' ? hordeModel(type, seed, variant) : null;
      const stock = theme === 'sakura' ? undefined : theme;
      // a model pack's infected (Settings) on the maps with the standard look; the Warden keeps his own frame
      const model = !theme && type !== 'warden' && hasModel('zombie');
      const rig: ZombieRig = anime
        ? new AnimeZombieRig(type, anime, dims, seed, variant)
        : model
          ? new ModelZombieRig(type, dims.radius, dims.height, dims.headRadius, seed)
          : new ZombieRigImpl(get(type, type === 'warden' ? undefined : stock), material, dims, seed);
      rigs.add(rig);
      const dispose = rig.dispose.bind(rig);
      rig.dispose = (): void => {
        rigs.delete(rig);
        dispose();
      };
      return rig;
    },
    /** The Asylum's boss (`matronRig.ts`). */
    createMatron(seed: number): ZombieRig {
      const rig = new MatronRig(material, seed);
      rigs.add(rig);
      const dispose = rig.dispose.bind(rig);
      rig.dispose = (): void => {
        rigs.delete(rig);
        dispose();
      };
      return rig;
    },
    prewarm(theme?: ZombieTheme): void {
      // the Sakura District's stand-ins are the standard looks
      if (theme === 'sakura') theme = undefined;
      for (const type of (theme ? ['shambler', 'runner', 'armored'] : ['shambler', 'runner', 'armored', 'warden']) as ZombieType[]) {
        const a = get(type, theme);
        for (let i = 0; i < a.variants.length; i++) variantGeometry(a, i);
      }
      // the Forge's Infernus (and its reborn) wear the standard Warden's frame
      if (theme === 'forge') variantGeometry(get('warden'), 0);
    },
    dispose(): void {
      for (const r of rigs) r.dispose();
      rigs.clear();
      for (const a of assets.values()) for (const g of a.variants) g?.dispose();
      assets.clear();
      material.dispose();
      texture.dispose();
      disposeShapeCache();
    },
  };
}
