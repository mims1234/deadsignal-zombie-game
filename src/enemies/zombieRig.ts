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
import { AnimeZombieRig, asylumInfected, hordeModel, matronModel } from '../anime/cast';
import { MatronRig } from './matronRig';
import { hasModel } from '../models/library';
import { ModelZombieRig } from '../models/zombieRig';
import type { ZombieFactory, ZombieRig, ZombieTheme } from './zombieRigTypes';
import { ZARYA_KINDS, VARIANT_BASE, type ZaryaKind, type ZombieVariant } from './variants';

export interface ZombieFactoryExt extends ZombieFactory {
  /** Bake every appearance variant now (avoids a few ms of hitching on first spawn of each variant); with a theme, its looks instead. */
  prewarm(theme?: ZombieTheme): void;
  /** The Asylum's boss, the Matron (`built`: never her real-asset model). */
  createMatron(seed: number, built?: boolean): ZombieRig;
  /** Shared material (debug / harness). */
  readonly material: THREE.MeshStandardMaterial;
}

export function createZombieFactory(): ZombieFactoryExt {
  const texture = createDetailTexture();
  const material = createZombieMaterial(texture);
  const assets = new Map<string, TypeAssets>();
  const rigs = new Set<ZombieRig>();
  const get = (type: ZombieType, theme?: ZombieTheme, kind?: ZaryaKind): TypeAssets => {
    const key = theme ? (kind ? `${type}:${theme}:${kind}` : `${type}:${theme}`) : type;
    let a = assets.get(key);
    if (!a) {
      a = makeTypeAssets(type, theme, kind);
      assets.set(key, a);
    }
    return a;
  };
  // ZARYA's kinds have bodies of their own (`zombie/zarya.ts`); anything else that map is asked for is a townsperson
  const zaryaKind = (theme: ZombieTheme | undefined, variant: ZombieVariant): ZaryaKind | undefined => (theme === 'zarya' && (ZARYA_KINDS as readonly string[]).includes(variant) ? (variant as ZaryaKind) : undefined);
  // what the house spirit is drawn in while it stands unseen: the shared material, almost clear (made when first wanted)
  let ghost: THREE.MeshStandardMaterial | null = null;
  const ghostMaterial = (): THREE.MeshStandardMaterial => {
    if (!ghost) {
      ghost = createZombieMaterial(texture);
      ghost.name = 'ZombieGhost';
      ghost.transparent = true;
      ghost.opacity = 0.045;
      ghost.depthWrite = false;
    }
    return ghost;
  };
  return {
    material,
    create(type: ZombieType, seed: number, theme?: ZombieTheme, variant: ZombieVariant = '', built = false): ZombieRig {
      const def = ZOMBIES[type];
      const dims = { radius: def.radius, height: def.height, headRadius: def.headRadius };
      const anime = theme === 'sakura' ? hordeModel(type, seed, variant) : null;
      // the Asylum's lost in real-asset models (NEW 3D MODELS, when loaded), a little smaller like the built ones
      const lost = theme === 'asylum' && !built ? asylumInfected(type, seed) : null;
      const stock = theme === 'sakura' ? undefined : theme;
      const kind = zaryaKind(theme, variant);
      // a model pack's infected (Settings) on the maps with the standard look; the Warden keeps his own frame
      const model = !theme && type !== 'warden' && hasModel('zombie');
      const rig: ZombieRig = lost
        ? new AnimeZombieRig(type, lost.template, { ...dims, height: dims.height * (type === 'armored' ? 0.93 : 0.95) }, seed, '', { tint: lost.tint, wants: lost.file })
        : anime
        ? new AnimeZombieRig(type, anime, dims, seed, variant)
        : model
          ? new ModelZombieRig(type, dims.radius, dims.height, dims.headRadius, seed)
          : new ZombieRigImpl(get(type, type === 'warden' && stock !== 'forge' ? undefined : stock, type === 'warden' ? undefined : kind), material, dims, seed, kind === 'domovoi' ? ghostMaterial() : null);
      rigs.add(rig);
      const dispose = rig.dispose.bind(rig);
      rig.dispose = (): void => {
        rigs.delete(rig);
        dispose();
      };
      return rig;
    },
    /** The Asylum's boss (`matronRig.ts`). */
    createMatron(seed: number, built = false): ZombieRig {
      // in her real-asset model with NEW 3D MODELS (when loaded), else built
      const rig = new MatronRig(material, seed, (built ? null : matronModel()) ?? undefined);
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
      // the Forge's Infernus has a body of its own (`zombie/forge.ts`), on the Warden's frame
      if (theme === 'forge') variantGeometry(get('warden', 'forge'), 0);
      // ZARYA's special kinds, each on its type's frame
      if (theme === 'zarya') {
        variantGeometry(get('warden', 'zarya'), 0); // the bosses' frame (Morozko, Baba Yaga dressed over it)
        for (const k of ZARYA_KINDS) {
          const a = get(VARIANT_BASE[k], 'zarya', k);
          for (let i = 0; i < a.variants.length; i++) variantGeometry(a, i);
        }
      }
    },
    dispose(): void {
      for (const r of rigs) r.dispose();
      rigs.clear();
      for (const a of assets.values()) for (const g of a.variants) g?.dispose();
      assets.clear();
      material.dispose();
      ghost?.dispose();
      texture.dispose();
      disposeShapeCache();
    },
  };
}
