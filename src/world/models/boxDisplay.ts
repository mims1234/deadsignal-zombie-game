/**
 * What a mystery box shows: low-poly floating guns (rifle, pistol, shotgun, HX-7), reusing the ammo and grenade
 * pickups for the other prizes, and the glowing "?" that hangs over a box nobody has opened.
 * Gun models lie along X (muzzle at +X) at about real size; geometry and materials are shared.
 */
import * as THREE from 'three';
import type { MeleeId } from '../../logic/melee';
import type { WeaponId } from '../../types';

type Part = [geo: THREE.BufferGeometry, mat: 'dark' | 'steel' | 'olive' | 'wood' | 'glow', x: number, y: number, z: number, rz?: number];

let shared: { mats: Record<Part[1], THREE.Material>; guns: Record<WeaponId, Part[]>; melee: Partial<Record<MeleeId, Part[]>>; mark: THREE.SpriteMaterial } | null = null;

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
    // never in a box (the Sakura District's relics), but drawn the same way if ever asked
    hanafubuki: [
      [box(0.3, 0.14, 0.12), 'dark', -0.1, 0, 0],
      [tube(0.06, 0.5), 'steel', 0.3, 0, 0],
    ],
    raijin: [
      [tube(0.16, 0.22), 'olive', -0.1, 0, 0],
      [tube(0.04, 0.6), 'dark', 0.3, 0, 0],
    ],
    // never in a box either (ZARYA's guns: built, bought or dropped there), but drawn the same way if ever asked
    signalka: [
      [tube(0.03, 0.2), 'steel', 0.06, 0.03, 0],
      [box(0.045, 0.12, 0.03), 'wood', -0.05, -0.05, 0, -0.25],
    ],
    arbalet: [
      [box(0.7, 0.045, 0.04), 'wood', 0, 0, 0],
      [box(0.03, 0.03, 0.5), 'steel', 0.33, 0, 0],
      [box(0.04, 0.11, 0.03), 'wood', -0.12, -0.07, 0, -0.2],
    ],
    gvozdomyot: [
      [box(0.3, 0.1, 0.06), 'olive', -0.02, 0, 0],
      [tube(0.014, 0.2), 'steel', 0.23, 0, 0],
      [box(0.26, 0.03, 0.02), 'steel', 0.12, -0.09, 0, 0.4],
      [box(0.04, 0.11, 0.03), 'dark', -0.1, -0.1, 0, -0.2],
    ],
    salyut: [
      [tube(0.022, 0.42), 'olive', 0.08, 0.02, -0.05],
      [tube(0.022, 0.42), 'olive', 0.08, 0.02, 0],
      [tube(0.022, 0.42), 'olive', 0.08, 0.02, 0.05],
      [box(0.4, 0.012, 0.2), 'wood', 0.06, -0.01, 0],
    ],
    ottepel: [
      [tube(0.016, 0.6), 'steel', 0.2, 0, 0],
      [tube(0.05, 0.16), 'olive', -0.16, 0, 0],
      [tube(0.036, 0.08, 0.016), 'steel', 0.54, 0, 0],
    ],
    zenit: [
      [box(0.14, 0.08, 0.05), 'dark', 0, 0, 0],
      [tube(0.03, 0.06), 'steel', 0, 0, 0.05],
      [box(0.05, 0.03, 0.04), 'steel', 0, 0.055, 0],
    ],
    // ZARYA's sack: the vacuum cleaner's round canister, its hose, the wand and the wide nozzle
    raketa: [
      [tube(0.1, 0.26), 'olive', -0.24, 0, 0],
      [tube(0.104, 0.03), 'steel', -0.24, 0, 0],
      [box(0.12, 0.03, 0.04), 'dark', -0.24, 0.12, 0],
      [new THREE.TorusGeometry(0.08, 0.016, 6, 12, Math.PI), 'dark', -0.06, 0.02, 0],
      [tube(0.02, 0.44), 'steel', 0.22, 0.02, 0],
      [box(0.05, 0.11, 0.03), 'dark', 0.06, -0.05, 0, -0.2],
      [box(0.07, 0.05, 0.2), 'dark', 0.47, 0.02, 0],
    ],
  };
  // what a box holds to swing (ZARYA's sack): the Kisten's handle, its chain and the iron weight
  const link = box(0.035, 0.012, 0.02);
  const melee: Partial<Record<MeleeId, Part[]>> = {
    kisten: [
      [tube(0.016, 0.26), 'wood', -0.13, 0, 0],
      [tube(0.02, 0.03), 'steel', 0.01, 0, 0],
      [link, 'steel', 0.045, -0.01, 0, -0.5],
      [link, 'steel', 0.07, -0.035, 0, -0.9],
      [link, 'steel', 0.085, -0.068, 0, -1.3],
      [link, 'steel', 0.09, -0.1, 0, -1.6],
      [new THREE.IcosahedronGeometry(0.045, 1), 'dark', 0.09, -0.15, 0],
    ],
  };
  shared = { mats, guns, melee, mark: questionMark() };
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

/** A floating weapon to swing for the mystery box reel (the ones a box can hold: ZARYA's Kisten). */
export function createMeleeDisplay(id: MeleeId): THREE.Group {
  const s = getShared();
  const g = new THREE.Group();
  g.name = `BoxMelee:${id}`;
  for (const [geo, mat, x, y, z, rz] of s.melee[id] ?? []) {
    const m = new THREE.Mesh(geo, s.mats[mat]);
    m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    g.add(m);
  }
  g.scale.setScalar(1.6);
  return g;
}

/** ZARYA: the gold snowflake that hangs over Ded Moroz's sack (its "?"), drawn once. */
let sackMark: THREE.SpriteMaterial | null = null;

export function createSackMark(): THREE.Sprite {
  if (!sackMark) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,214,120,0.5)');
    grad.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    g.translate(64, 64);
    g.strokeStyle = '#ffe6a8';
    g.shadowColor = '#ffb040';
    g.shadowBlur = 12;
    g.lineCap = 'round';
    g.lineWidth = 7;
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -42);
      g.moveTo(0, -26);
      g.lineTo(-11, -36);
      g.moveTo(0, -26);
      g.lineTo(11, -36);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    sackMark = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
  }
  const s = new THREE.Sprite(sackMark);
  s.scale.set(0.5, 0.5, 1);
  return s;
}

/** The "?" over an unopened box. */
export function createBoxMark(): THREE.Sprite {
  const s = new THREE.Sprite(getShared().mark);
  s.scale.set(0.55, 0.55, 1);
  return s;
}
