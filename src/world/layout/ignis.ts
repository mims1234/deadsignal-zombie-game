/**
 * Ignis, Vulcan's fire (the icon from vulcan.genxmims.org, used with the owner's go-ahead): on the furnace door, over
 * the Ledger House, on the terminals that still say IGNIS EARNING: OFF, and in the HUD. Never with an amount.
 * Every use paints its canvas at once and again with the icon once the image has loaded.
 */
import * as THREE from 'three';
import iconUrl from '../art/ignis-icon.png';

export const IGNIS_ICON_URL: string = iconUrl;

let icon: Promise<HTMLImageElement> | null = null;

export function loadIgnisIcon(): Promise<HTMLImageElement> {
  icon ??= new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('no images here'));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ignis icon failed to load'));
    img.src = iconUrl;
  });
  return icon;
}

/** A canvas texture painted now and again once the icon is in (`paint` gets the image, or null before it loads). */
function iconTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D, img: HTMLImageElement | null) => void): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  paint(g, null);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  void loadIgnisIcon()
    .then((img) => {
      g.clearRect(0, 0, w, h);
      paint(g, img);
      tex.needsUpdate = true;
    })
    .catch(() => {});
  return tex;
}

/**
 * Draw the icon into (x, y, s, s). `dim` greys it out (the furnace starved); `cold` turns it cold white (the reveal).
 */
export function drawIgnis(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, s: number, mode: 'lit' | 'dim' | 'cold' = 'lit'): void {
  g.save();
  if (mode === 'dim') g.filter = 'grayscale(0.85) brightness(0.45)';
  else if (mode === 'cold') g.filter = 'grayscale(1) brightness(1.6) contrast(1.1)';
  else {
    g.shadowColor = '#ff8a2a';
    g.shadowBlur = s * 0.12;
  }
  g.drawImage(img, x, y, s, s);
  g.restore();
  if (mode === 'cold') {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(170, 220, 255, 0.35)';
    g.fillRect(x, y, s, s);
    g.restore();
  }
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** The icon alone on a transparent plane (signs, the furnace door). */
export function ignisMaterial(mode: 'lit' | 'dim' | 'cold' = 'lit'): THREE.MeshStandardMaterial {
  const key = `icon:${mode}`;
  let m = cache.get(key);
  if (m) return m;
  const tex = iconTexture(256, 256, (g, img) => {
    if (img) drawIgnis(g, img, 8, 8, 240, mode);
  });
  m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: mode === 'dim' ? 0.25 : mode === 'cold' ? 2.2 : 1.4, transparent: true, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide });
  cache.set(key, m);
  return m;
}

/** A terminal screen: the dimmed icon and IGNIS EARNING: OFF, in a dead green glow. */
export function ignisTerminalMaterial(): THREE.MeshStandardMaterial {
  const key = 'terminal';
  let m = cache.get(key);
  if (m) return m;
  const W = 256;
  const H = 160;
  const tex = iconTexture(W, H, (g, img) => {
    g.fillStyle = '#060a07';
    g.fillRect(0, 0, W, H);
    if (img) drawIgnis(g, img, 12, 26, 108, 'dim');
    g.fillStyle = '#ff6a3a';
    g.font = '700 22px ui-monospace, monospace';
    g.textBaseline = 'middle';
    g.fillText('IGNIS', 132, 52);
    g.fillText('EARNING:', 132, 82);
    g.fillStyle = '#ff3a2a';
    g.fillText('OFF', 132, 112);
    g.strokeStyle = 'rgba(120, 200, 140, 0.25)';
    for (let y = 2; y < H; y += 4) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
  });
  m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.4 });
  cache.set(key, m);
  return m;
}
