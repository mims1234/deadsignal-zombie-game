/**
 * What a mystery box shows: low-poly floating guns (rifle, pistol, shotgun, HX-7), reusing the ammo and grenade
 * pickups for the other prizes, and the glowing "?" that hangs over a box nobody has opened.
 * Gun models lie along X (muzzle at +X) at about real size; geometry and materials are shared.
 */
import * as THREE from 'three';
import type { WeaponId } from '../../types';

type Part = [geo: THREE.BufferGeometry, mat: 'dark' | 'steel' | 'olive' | 'wood' | 'glow', x: number, y: number, z: number, rz?: number];

let shared: { mats: Record<Part[1], THREE.Material>; guns: Record<WeaponId, Part[]>; mark: THREE.SpriteMaterial } | null = null;

const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
const tube = (r: number, len: number, r2 = r): THREE.BufferGeometry => new THREE.CylinderGeometry(r2, r, len, 12).rotateZ(-Math.PI / 2);

function questionMark(): THREE.SpriteMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,200,90,0.55)');
  grad.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.font = '800 92px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ffb040';
  g.shadowBlur = 14;
  g.fillStyle = '#ffe2a0';
  g.fillText('?', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
}

function getShared(): NonNullable<typeof shared> {
  if (shared) return shared;
  const mats = {
    dark: new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.55, metalness: 0.4, emissive: 0xffa040, emissiveIntensity: 0.08 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.35, metalness: 0.85, emissive: 0xffa040, emissiveIntensity: 0.06 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4d5636, roughness: 0.6, metalness: 0.2, emissive: 0xffa040, emissiveIntensity: 0.08 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7, metalness: 0, emissive: 0xffa040, emissiveIntensity: 0.06 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffc070 }),
  };
  const guns: Record<WeaponId, Part[]> = {
    rifle: [
      [box(0.32, 0.09, 0.05), 'dark', -0.02, 0, 0],
      [box(0.22, 0.1, 0.045), 'dark', -0.3, -0.02, 0, -0.05],
      [box(0.3, 0.06, 0.055), 'olive', 0.27, 0, 0],
      [tube(0.012, 0.3), 'steel', 0.56, 0.01, 0],
      [box(0.05, 0.16, 0.035), 'dark', 0.06, -0.12, 0, 0.18],
      [box(0.045, 0.13, 0.035), 'dark', -0.08, -0.1, 0, -0.25],
      [box(0.12, 0.05, 0.04), 'dark', 0.0, 0.08, 0],
    ],
    pistol: [
      [box(0.2, 0.045, 0.032), 'steel', 0.03, 0.03, 0],
      [box(0.16, 0.03, 0.03), 'dark', 0.02, 0, 0],
      [box(0.045, 0.12, 0.03), 'dark', -0.05, -0.06, 0, -0.25],
    ],
    shotgun: [
      [tube(0.016, 0.62), 'steel', 0.32, 0.02, 0],
      [tube(0.013, 0.5), 'dark', 0.26, -0.015, 0],
      [box(0.2, 0.08, 0.05), 'dark', -0.06, 0, 0],
      [box(0.16, 0.05, 0.05), 'wood', 0.25, -0.03, 0],
      [box(0.3, 0.09, 0.045), 'wood', -0.3, -0.03, 0, -0.08],
    ],
    rpg: [
      [tube(0.045, 0.95), 'olive', 0.05, 0, 0],
      [tube(0.075, 0.16, 0.045), 'dark', -0.5, 0, 0],
      [new THREE.ConeGeometry(0.065, 0.24, 12).rotateZ(-Math.PI / 2), 'olive', 0.68, 0, 0],
      [tube(0.068, 0.08), 'olive', 0.54, 0, 0],
      [box(0.04, 0.13, 0.035), 'dark', -0.05, -0.1, 0, -0.2],
      [box(0.04, 0.1, 0.035), 'dark', 0.22, -0.09, 0],
      [box(0.03, 0.06, 0.02), 'steel', 0.12, 0.07, -0.03],
    ],
  };
  shared = { mats, guns, mark: questionMark() };
  return shared;
}

/** A floating gun for the mystery box reel. */
export function createGunDisplay(id: WeaponId): THREE.Group {
  const s = getShared();
  const g = new THREE.Group();
  g.name = `BoxGun:${id}`;
  for (const [geo, mat, x, y, z, rz] of s.guns[id]) {
    const m = new THREE.Mesh(geo, s.mats[mat]);
    m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    g.add(m);
  }
  return g;
}

/** The "?" over an unopened box. */
export function createBoxMark(): THREE.Sprite {
  const s = new THREE.Sprite(getShared().mark);
  s.scale.set(0.55, 0.55, 1);
  return s;
}
