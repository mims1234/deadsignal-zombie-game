/**
 * Vulcan on the Forge: the clan's phoenix logo (vulcan.genxmims.org) on a rooftop billboard over Vulcan HQ, burning
 * in the crossroads, and on clan banners hung around the perimeter - plus the quarantine signs of an HQ that fell.
 * The logo is a white phoenix on transparency; every use tints it on a canvas once the image has loaded.
 */
import * as THREE from 'three';
import logoUrl from '../art/vulcan-logo.png';
import { neonLabelMaterial } from '../landmarks/tex';
import { addBox, wallDecal } from '../structures';
import { HALF_PI, type Ctx } from './util';

let logo: Promise<HTMLImageElement> | null = null;

function loadLogo(): Promise<HTMLImageElement> {
  logo ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('vulcan logo failed to load'));
    img.src = logoUrl;
  });
  return logo;
}

/** Draw the logo tinted `color`, fitted into the box (x, y, w, h) of `g`. */
function drawLogo(g: CanvasRenderingContext2D, img: HTMLImageElement, color: string, x: number, y: number, w: number, h: number, glow = 0): void {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  const tint = document.createElement('canvas');
  tint.width = Math.ceil(dw);
  tint.height = Math.ceil(dh);
  const t = tint.getContext('2d')!;
  t.drawImage(img, 0, 0, dw, dh);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, dw, dh);
  g.save();
  if (glow > 0) {
    g.shadowColor = color;
    g.shadowBlur = glow;
  }
  g.drawImage(tint, x + (w - dw) / 2, y + (h - dh) / 2);
  g.restore();
}

/** A canvas texture painted now (`base`) and again with the logo once it has loaded (`withLogo`). */
function logoTexture(width: number, height: number, base: (g: CanvasRenderingContext2D) => void, withLogo: (g: CanvasRenderingContext2D, img: HTMLImageElement) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d')!;
  base(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  void loadLogo()
    .then((img) => {
      withLogo(g, img);
      tex.needsUpdate = true;
    })
    .catch(() => {});
  return tex;
}

/** The crossroads sigil: a burning double ring with the phoenix inside. */
export function vulcanSigilMaterial(): THREE.MeshStandardMaterial {
  const tex = logoTexture(
    512,
    512,
    (g) => {
      g.strokeStyle = '#ff7a1a';
      g.shadowColor = '#ff9a3a';
      g.shadowBlur = 18;
      g.lineWidth = 14;
      g.beginPath();
      g.arc(256, 256, 236, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 5;
      g.beginPath();
      g.arc(256, 256, 212, 0, Math.PI * 2);
      g.stroke();
    },
    (g, img) => drawLogo(g, img, '#ff7a1a', 76, 86, 360, 340, 16),
  );
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xff6a10, emissiveMap: tex, emissiveIntensity: 1.6, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
}

let bannerMat: THREE.MeshStandardMaterial | null = null;

/** A hanging clan banner: deep ember red, the phoenix, VULCAN beneath. */
function clanBanner(): THREE.MeshStandardMaterial {
  if (bannerMat) return bannerMat;
  const W = 256;
  const H = 384;
  const tex = logoTexture(
    W,
    H,
    (g) => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#3a0b06');
      grad.addColorStop(0.6, '#5a140a');
      grad.addColorStop(1, '#22070a');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      // a torn hem
      g.fillStyle = '#000000';
      for (let x = 0; x < W; x += 32) {
        g.beginPath();
        g.moveTo(x, H);
        g.lineTo(x + 16, H - 22);
        g.lineTo(x + 32, H);
        g.fill();
      }
      g.strokeStyle = '#ff8a2a';
      g.lineWidth = 6;
      g.strokeRect(10, 10, W - 20, H - 44);
      g.font = '800 44px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#ffb060';
      g.shadowColor = '#ff7a1a';
      g.shadowBlur = 10;
      g.fillText('VULCAN', W / 2, H - 70);
    },
    (g, img) => drawLogo(g, img, '#ffd2a0', 28, 30, W - 56, 220, 12),
  );
  bannerMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45, roughness: 0.95, side: THREE.DoubleSide });
  return bannerMat;
}

/** A banner on a short rod, hung flat against a wall that faces along yaw `rot` (0 = facing +Z). */
function banner(c: Ctx, x: number, z: number, rot: number, y = 3.4): void {
  const { b } = c;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.3), clanBanner());
  m.position.set(x, y, z);
  m.rotation.y = rot;
  b.add(m);
  addBox(b, 'steelDark', x, y + 1.72, z, 2.5, 0.08, 0.08, rot, { cast: false });
}

/**
 * Vulcan HQ (the forge hall on the plaza) and the clan's banners around the Forge (on the inside of the perimeter
 * wall of `bounds`). Returns the rooftop billboard, which the reveal tears away (`forge/reveal.ts`).
 */
export function vulcanForge(c: Ctx, hq: { x: number; z: number; frontZ: number; height: number }, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): THREE.Object3D {
  const { b } = c;
  // rooftop billboard: the phoenix over VULCAN HQ, facing the street
  const W = 512;
  const H = 400;
  const tex = logoTexture(
    W,
    H,
    (g) => {
      g.fillStyle = '#120806';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#ff7a1a';
      g.lineWidth = 8;
      g.strokeRect(8, 8, W - 16, H - 16);
    },
    (g, img) => drawLogo(g, img, '#ff9a3a', 40, 30, W - 80, H - 60, 22),
  );
  // the board and its frame move together (the reveal tears them off the roof), so they are not baked in
  const sign = new THREE.Group();
  const by = hq.height + 4.4;
  sign.position.set(hq.x, by, hq.frontZ + 0.6);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 5.5), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.8 }));
  board.position.z = -0.05;
  board.rotation.y = Math.PI; // the hall's street front faces -Z
  const frame = new THREE.Mesh(new THREE.BoxGeometry(7.4, 5.9, 0.2), b.mats.get('steelDark'));
  frame.position.z = 0.08;
  frame.castShadow = true;
  sign.add(board, frame);
  b.addDynamic(sign);
  for (const s of [-1, 1]) addBox(b, 'steelDark', hq.x + s * 2.6, hq.height + 0.8, hq.frontZ + 0.9, 0.25, 1.6, 0.25);
  b.light({ x: hq.x, y: by, z: hq.frontZ - 2.5, color: 0xff8a2a, intensity: 120, distance: 18 });
  // the HQ fell: quarantine signs beside the door
  addBox(b, neonLabelMaterial('VULCAN HQ', '#ff7a1a'), hq.x, hq.height + 1.2, hq.frontZ - 0.25, 10, 1.5, 0.12, 0, { cast: false });
  addBox(b, neonLabelMaterial('QUARANTINED', '#ff3a2a'), hq.x - 4, 3.6, hq.frontZ - 0.2, 3.2, 0.6, 0.1, 0, { cast: false });
  wallDecal(b, 'stencilKeepOut', hq.x + 3.9, 2.2, hq.frontZ - 0.08, 3, 1.4, Math.PI);
  banner(c, hq.x - 7.9, hq.frontZ - 0.12, Math.PI, 3.6);
  banner(c, hq.x + 7.9, hq.frontZ - 0.12, Math.PI, 3.6);

  // clan banners on the inside of the perimeter wall (clear of the buildings along it)
  const N = bounds.minZ + 1.35;
  const S = bounds.maxZ - 1.35;
  const E = bounds.maxX - 1.35;
  const Wx = bounds.minX + 1.35;
  for (const x of [-66, -10, 24, 58]) banner(c, x, N, 0);
  for (const x of [-66, -26, 30, 74]) banner(c, x, S, Math.PI);
  for (const z of [-30, 0, 46]) banner(c, E, z, -HALF_PI);
  for (const z of [-53, 53]) banner(c, Wx, z, HALF_PI);
  return sign;
}
