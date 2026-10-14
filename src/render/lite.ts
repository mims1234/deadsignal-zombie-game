/**
 * Help for weaker devices (phones, tablets, low-memory laptops). Everything here is driven by the Low quality preset,
 * which phones start on and weak computers are now given by default:
 *  - every painted texture is halved before it is uploaded (a quarter of the memory, on the GPU and in the page);
 *  - small props beyond a short distance are not drawn (fewer draw calls), see `DetailCuller`;
 *  - the view distance stops where the fog already hides everything (set by the renderer).
 */
import * as THREE from 'three';

/** A device that should start on the Low preset: touch screens, and computers with little memory or few cores. */
export function isWeakDevice(touch: boolean): boolean {
  if (touch) return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || (navigator.hardwareConcurrency || 8) <= 4;
}

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap'] as const;

/** Half-size RGBA8 by 2x2 box filter. */
function halveData(src: ArrayLike<number>, w: number, h: number): { data: Uint8Array; width: number; height: number } {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const r0 = 2 * y * w;
    const r1 = Math.min(h - 1, 2 * y + 1) * w;
    for (let x = 0; x < nw; x++) {
      const a = (r0 + 2 * x) * 4;
      const b = (r0 + Math.min(w - 1, 2 * x + 1)) * 4;
      const c = (r1 + 2 * x) * 4;
      const d = (r1 + Math.min(w - 1, 2 * x + 1)) * 4;
      const o = (y * nw + x) * 4;
      for (let k = 0; k < 4; k++) out[o + k] = (src[a + k]! + src[b + k]! + src[c + k]! + src[d + k]!) >> 2;
    }
  }
  return { data: out, width: nw, height: nh };
}

function halveTexture(t: THREE.Texture, minSize: number): boolean {
  const img = t.image as { width?: number; height?: number; data?: ArrayLike<number> } | null;
  if (!img || !img.width || !img.height || Math.min(img.width, img.height) < minSize) return false;
  if (t.mipmaps && t.mipmaps.length > 1) {
    // a hand-built mip chain (the fences): drop its top level
    const [, next, ...rest] = t.mipmaps as { data: Uint8Array; width: number; height: number }[];
    t.mipmaps = [next!, ...rest];
    t.image = next as never;
  } else if ((t as THREE.DataTexture).isDataTexture && img.data && img.data.length === img.width * img.height * 4) {
    t.image = halveData(img.data, img.width, img.height) as never;
  } else if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, img.width >> 1);
    c.height = Math.max(1, img.height >> 1);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    t.image = c;
  } else {
    return false;
  }
  t.anisotropy = Math.min(t.anisotropy, 2);
  t.needsUpdate = true;
  return true;
}

/**
 * Halve every texture of at least `minSize` px used by the materials under `roots` (once each, before they are first
 * uploaded). Returns how many were halved and the megapixels saved.
 */
export function halveTextures(roots: THREE.Object3D[], minSize = 256): { count: number; savedMp: number } {
  const seen = new Set<THREE.Texture>();
  let count = 0;
  let saved = 0;
  for (const root of roots) {
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const k of MAP_KEYS) {
          const t = (mat as unknown as Record<string, THREE.Texture | null | undefined>)[k];
          if (!t || seen.has(t)) continue;
          seen.add(t);
          const img = t.image as { width?: number; height?: number } | null;
          const before = (img?.width ?? 0) * (img?.height ?? 0);
          if (halveTexture(t, minSize)) {
            count++;
            saved += before * 0.75;
          }
        }
      }
    });
  }
  return { count, savedMp: saved / 1e6 };
}

/**
 * Small props are not drawn beyond `distance` (they move to an unrendered layer, so whatever the game does with
 * `.visible` is untouched). Built once over the static level; checked a few times a second.
 */
export class DetailCuller {
  private readonly items: { obj: THREE.Object3D; x: number; y: number; z: number; far: boolean }[] = [];
  private timer = 0;
  distance = Infinity;

  constructor(root: THREE.Object3D, maxRadius = 4) {
    root.updateMatrixWorld(true);
    const s = new THREE.Vector3();
    const c = new THREE.Vector3();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = g.boundingSphere;
      if (!bs) return;
      o.getWorldScale(s);
      if (bs.radius * Math.max(s.x, s.y, s.z) >= maxRadius) return;
      c.copy(bs.center).applyMatrix4(o.matrixWorld);
      this.items.push({ obj: o, x: c.x, y: c.y, z: c.z, far: false });
    });
  }

  get size(): number {
    return this.items.length;
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const d2 = this.distance * this.distance;
    for (const it of this.items) {
      const far = (it.x - cam.x) ** 2 + (it.y - cam.y) ** 2 + (it.z - cam.z) ** 2 > d2;
      if (far === it.far) continue;
      it.far = far;
      if (far) it.obj.layers.set(31);
      else it.obj.layers.set(0);
    }
  }
}
