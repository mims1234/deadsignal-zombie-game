/**
 * The women of the Asylum (and anyone else with a `look`): a softer face with large eyes, hair styles, and outfits
 * (nurse dress and cap, hospital gown, lab coat, field kit, a chaplain's habit). Built from primitives onto an
 * `Avatar`'s head, chest and body groups; the skeleton, the arm solver and the weapon holds are the Avatar's own.
 */
import * as THREE from 'three';
import type { AvatarLook } from '../config';

const mat = (color: number, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

function place(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  parent.add(mesh);
  return mesh;
}

/**
 * A woman's limbs, shared by every such figure: rounded and tapered (thigh to knee to ankle, shoulder to wrist), with
 * smaller hands and low shoes. Same pivots and lengths as the stock limbs, so the walk and the arm solver are unchanged.
 */
export interface FemaleParts {
  upper: THREE.BufferGeometry;
  fore: THREE.BufferGeometry;
  hand: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  shoe: THREE.BufferGeometry;
}
let femaleParts: FemaleParts | null = null;
/** Shared limb geometry is kept when a figure is disposed. */
export function isFemalePart(g: THREE.BufferGeometry | undefined): boolean {
  return !!femaleParts && !!g && Object.values(femaleParts).includes(g);
}
export function getFemaleParts(upper: number, fore: number, thigh: number, shin: number): FemaleParts {
  if (femaleParts) return femaleParts;
  const limb = (r0: number, r1: number, len: number, extra = 0): THREE.BufferGeometry => new THREE.CylinderGeometry(r0, r1, len + extra, 12).translate(0, -(len + extra) / 2 + extra / 2, 0);
  femaleParts = {
    upper: limb(0.048, 0.04, upper, 0.04),
    fore: limb(0.04, 0.03, fore),
    hand: new THREE.BoxGeometry(0.055, 0.085, 0.04).translate(0, -0.045, 0),
    thigh: limb(0.078, 0.056, thigh, 0.04),
    shin: limb(0.054, 0.036, shin),
    shoe: new THREE.BoxGeometry(0.085, 0.07, 0.22).translate(0, -0.035, -0.035),
  };
  return femaleParts;
}

/**
 * The figure's torso on the chest group (the waist is its origin; the shoulders sit at 0.47): ribs narrowing to the
 * waist, the chest and a modest bust line, rounded shoulders. And the hips on the body group, flaring out from the
 * waist. Everything in the outfit's colour; dresses and coats hang over the hips.
 */
export function addFigure(body: THREE.Object3D, chest: THREE.Object3D, cloth: THREE.Material, hips: THREE.Material): void {
  const waist = place(chest, new THREE.CylinderGeometry(0.128, 0.104, 0.24, 18), cloth, 0, 0.12, 0);
  waist.scale.z = 0.78;
  const upper = place(chest, new THREE.CylinderGeometry(0.158, 0.128, 0.28, 18), cloth, 0, 0.38, 0);
  upper.scale.z = 0.72;
  for (const s of [-1, 1]) {
    const b = place(chest, new THREE.SphereGeometry(0.056, 14, 10), cloth, s * 0.054, 0.32, -0.072);
    b.scale.set(1, 0.88, 0.72);
    place(chest, new THREE.SphereGeometry(0.058, 12, 10), cloth, s * 0.168, 0.47, 0);
  }
  const hip = place(body, new THREE.CylinderGeometry(0.108, 0.168, 0.22, 18), hips, 0, 0.94, 0);
  hip.scale.z = 0.8;
}

/** Large, dark, glossy eyes with a highlight, lashes, a touch of blush and a small mouth (the head faces -Z, r 0.12). */
export function addFace(head: THREE.Object3D, look: AvatarLook): void {
  const eye = mat(look.eyes ?? 0x241a2c, 0.25);
  const white = mat(0xffffff, 0.2, { emissive: 0xffffff, emissiveIntensity: 0.35 });
  const lash = mat(0x140f12, 0.9);
  const blush = new THREE.MeshBasicMaterial({ color: 0xf08a9c, transparent: true, opacity: 0.45, depthWrite: false });
  for (const s of [-1, 1]) {
    const e = place(head, new THREE.SphereGeometry(0.024, 12, 10), eye, s * 0.043, 0.004, -0.108, false);
    e.scale.set(1, 1.28, 0.45);
    place(head, new THREE.SphereGeometry(0.0075, 6, 5), white, s * 0.043 + 0.008, 0.017, -0.118, false);
    const l = place(head, new THREE.BoxGeometry(0.054, 0.008, 0.012), lash, s * 0.044, 0.037, -0.112, false);
    l.rotation.z = s * -0.18;
    const b = place(head, new THREE.CircleGeometry(0.017, 12), blush, s * 0.066, -0.03, -0.103, false);
    b.rotation.y = Math.PI + s * 0.5;
  }
  place(head, new THREE.BoxGeometry(0.024, 0.006, 0.006), mat(0x9a4250, 0.6), 0, -0.052, -0.114, false);
  if (look.glasses) {
    const frame = mat(0x22262c, 0.4, { metalness: 0.4 });
    for (const s of [-1, 1]) place(head, new THREE.TorusGeometry(0.03, 0.004, 6, 18), frame, s * 0.044, 0.006, -0.124, false);
    place(head, new THREE.BoxGeometry(0.03, 0.005, 0.005), frame, 0, 0.012, -0.126, false);
  }
}

/** Hair on the head group (r 0.12, face toward -Z): a crown cap and fringe, then the style. */
export function addHair(head: THREE.Object3D, look: AvatarLook): void {
  const style = look.hair ?? 'bob';
  const hair = mat(look.hairColor ?? 0x2a1c14, 0.95);
  const veil = style === 'veil';
  const shell = (r: number, phiStart: number, phiLen: number, thetaLen: number, m: THREE.Material, y = 0, z = 0): THREE.Mesh =>
    place(head, new THREE.SphereGeometry(r, 18, 12, phiStart, phiLen, 0, thetaLen), m, 0, y, z);
  // the crown: covers the top and the back; the face (-Z) stays open below the fringe
  const crown = shell(veil ? 0.142 : 0.132, 0, Math.PI * 2, Math.PI * 0.42, veil ? mat(0x1c1c24, 0.9) : hair, 0.004, 0.004);
  crown.scale.set(1.02, 1, 1.04);
  // the back and sides (phi 0..PI is the back half; a little more wraps the temples)
  shell(veil ? 0.142 : 0.13, -0.35, Math.PI + 0.7, Math.PI * (style === 'short' ? 0.55 : veil ? 0.82 : 0.72), veil ? mat(0x1c1c24, 0.9) : hair, 0, 0.006);
  if (!veil) {
    // fringe across the forehead, a little uneven
    const f = place(head, new THREE.BoxGeometry(0.2, 0.045, 0.05), hair, 0, 0.074, -0.098);
    f.rotation.x = 0.35;
    for (const s of [-1, 1]) {
      const side = place(head, new THREE.BoxGeometry(0.035, 0.11, 0.05), hair, s * 0.105, 0.0, -0.06);
      side.rotation.z = s * 0.08;
    }
  }
  const tail = (x: number, y: number, z: number, len: number, r0: number, r1: number, rx: number, rz: number): void => {
    const g = new THREE.CylinderGeometry(r0, r1, len, 10).translate(0, -len / 2, 0);
    const t = place(head, g, hair, x, y, z);
    t.rotation.set(rx, 0, rz);
  };
  const bow = (x: number, y: number, z: number): void => {
    const m = mat(look.accent ?? 0xe0607e, 0.6);
    for (const s of [-1, 1]) {
      const w = place(head, new THREE.BoxGeometry(0.045, 0.03, 0.02), m, x + s * 0.022, y, z);
      w.rotation.z = s * 0.4;
    }
  };
  switch (style) {
    case 'long': {
      const back = place(head, new THREE.BoxGeometry(0.23, 0.34, 0.05), hair, 0, -0.2, 0.085);
      back.rotation.x = -0.08;
      for (const s of [-1, 1]) place(head, new THREE.BoxGeometry(0.04, 0.24, 0.06), hair, s * 0.11, -0.13, -0.01);
      break;
    }
    case 'ponytail':
      tail(0, 0.03, 0.125, 0.36, 0.04, 0.016, 0.35, 0);
      place(head, new THREE.TorusGeometry(0.024, 0.007, 6, 12), mat(look.accent ?? 0x30343a, 0.6), 0, 0.03, 0.128).rotation.x = Math.PI / 2;
      break;
    case 'twintails':
      for (const s of [-1, 1]) {
        tail(s * 0.118, 0.045, 0.035, 0.42, 0.048, 0.022, 0.12, s * 0.3);
        bow(s * 0.118, 0.06, 0.03);
      }
      break;
    case 'bun':
      place(head, new THREE.SphereGeometry(0.058, 12, 10), hair, 0, 0.085, 0.095);
      break;
    case 'puff': {
      const p = place(head, new THREE.SphereGeometry(0.115, 14, 12), hair, 0, 0.07, 0.07);
      p.scale.set(1.05, 0.9, 0.95);
      break;
    }
    case 'veil': {
      const cloth = mat(0x1c1c24, 0.9);
      const back = place(head, new THREE.BoxGeometry(0.27, 0.3, 0.05), cloth, 0, -0.13, 0.1);
      back.rotation.x = -0.15;
      // the white band across the brow
      place(head, new THREE.BoxGeometry(0.21, 0.03, 0.03), mat(0xf2f0ea, 0.7), 0, 0.068, -0.11);
      break;
    }
    case 'bob':
    case 'short':
      break;
  }
}

/** Outfit pieces that hang from the hips (dresses, gowns, coats, robes) and sit on the chest and head. */
export function addOutfit(body: THREE.Object3D, chest: THREE.Object3D, head: THREE.Object3D, look: AvatarLook, cloth: THREE.Material): void {
  const outfit = look.outfit;
  const accent = mat(look.accent ?? 0xd84a5a, 0.7);
  const white = mat(0xf4f2ec, 0.75);
  // a skirt: an open cone from the waist, seen from both sides
  const skirt = (len: number, rBottom: number, m: THREE.Material): void => {
    const sm = (m as THREE.MeshStandardMaterial).clone();
    sm.side = THREE.DoubleSide;
    place(body, new THREE.CylinderGeometry(0.128, rBottom, len, 18, 1, true), sm, 0, 1.06 - len / 2, 0);
  };
  switch (outfit) {
    case 'nurse':
      skirt(0.5, 0.29, cloth);
      // the apron, its bib, and the cap with its cross
      place(body, new THREE.BoxGeometry(0.2, 0.28, 0.02), white, 0, 0.88, -0.235).rotation.x = -0.14;
      place(chest, new THREE.BoxGeometry(0.2, 0.17, 0.02), white, 0, 0.24, -0.126);
      place(chest, new THREE.BoxGeometry(0.3, 0.05, 0.25), accent, 0, 0.5, 0); // collar trim
      place(head, new THREE.BoxGeometry(0.17, 0.055, 0.11), white, 0, 0.122, -0.02);
      place(head, new THREE.BoxGeometry(0.04, 0.012, 0.004), accent, 0, 0.128, -0.077);
      place(head, new THREE.BoxGeometry(0.012, 0.04, 0.004), accent, 0, 0.128, -0.077);
      break;
    case 'gown':
      skirt(0.44, 0.27, cloth);
      // ties at the back, a wristband
      place(chest, new THREE.BoxGeometry(0.05, 0.3, 0.02), white, 0, 0.3, 0.118);
      break;
    case 'coat':
      // a white coat over scrubs: the coat's skirt is open at the front (a cone with a gap)
      {
        const coat = (cloth as THREE.MeshStandardMaterial).clone();
        coat.side = THREE.DoubleSide;
        const g = new THREE.CylinderGeometry(0.14, 0.29, 0.56, 18, 1, true, Math.PI * 0.62, Math.PI * 1.76);
        place(body, g, coat, 0, 1.06 - 0.28, 0);
        place(chest, new THREE.BoxGeometry(0.08, 0.4, 0.02), accent, 0, 0.27, -0.124); // the scrubs under the open coat
        place(chest, new THREE.BoxGeometry(0.04, 0.08, 0.01), mat(0x3a7fc0, 0.5), 0.085, 0.4, -0.115); // a badge
      }
      break;
    case 'habit':
      skirt(0.98, 0.34, cloth);
      place(chest, new THREE.BoxGeometry(0.3, 0.06, 0.26), white, 0, 0.5, 0); // the collar
      place(chest, new THREE.BoxGeometry(0.03, 0.08, 0.01), mat(0xd8b04a, 0.4, { metalness: 0.6 }), 0, 0.22, -0.11); // a small cross
      break;
    case 'tactical':
      // a radio headset
      place(head, new THREE.BoxGeometry(0.03, 0.06, 0.05), mat(0x23282c, 0.6), 0.122, 0, 0);
      place(head, new THREE.BoxGeometry(0.008, 0.008, 0.08), mat(0x23282c, 0.6), 0.1, -0.04, -0.06).rotation.y = -0.5;
      break;
  }
}
