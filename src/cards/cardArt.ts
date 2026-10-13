/**
 * Card art: loads each carrier's card image, builds the matching card back, and makes the card as a solid 3D object.
 * A carrier whose image is missing from `art/` gets a plain generated card, so the mode never depends on the files.
 */
import * as THREE from 'three';
import { type CarrierDef, cssColor } from './roster';

const ART = import.meta.glob('./art/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Address of the emblem image, or undefined when it is not in `art/`. */
export function emblemUrl(): string | undefined {
  return ART['./art/emblem.webp'];
}

export interface CardKit {
  front: THREE.Texture;
  back: THREE.Texture;
  /** Width / height. */
  aspect: number;
  /** Image address for the HUD and menus. */
  url: string;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function finish(tex: THREE.Texture): THREE.Texture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function placeholder(def: CarrierDef): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 375;
  c.height = 525;
  const g = c.getContext('2d')!;
  g.fillStyle = '#14121c';
  g.beginPath();
  g.roundRect(8, 8, c.width - 16, c.height - 16, 22);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = cssColor(def.accent);
  g.stroke();
  g.fillStyle = '#f2eef8';
  g.textAlign = 'center';
  g.font = '700 34px sans-serif';
  g.fillText(def.name, c.width / 2, c.height * 0.82, c.width - 60);
  g.font = '18px sans-serif';
  g.fillStyle = cssColor(def.accent);
  g.fillText(def.series, c.width / 2, c.height * 0.89, c.width - 60);
  return c;
}

/** Card back: the front's silhouette (mirrored, so both faces line up) filled dark, with the emblem in the middle. */
function makeBack(front: CanvasImageSource, w: number, h: number, emblem: HTMLImageElement | null, accent: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.translate(w, 0);
  g.scale(-1, 1);
  g.drawImage(front, 0, 0, w, h);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-in';
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#231d3a');
  grad.addColorStop(1, '#0d0b18');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = cssColor(accent);
  g.globalAlpha = 0.55;
  g.lineWidth = Math.max(3, w * 0.008);
  g.strokeRect(w * 0.14, h * 0.1, w * 0.72, h * 0.8);
  if (emblem) {
    g.globalAlpha = 0.9;
    const ew = w * 0.5;
    const eh = (ew * emblem.naturalHeight) / emblem.naturalWidth;
    g.drawImage(emblem, (w - ew) / 2, (h - eh) / 2, ew, eh);
  }
  return finish(new THREE.CanvasTexture(c));
}

export async function loadCardKits(defs: readonly CarrierDef[]): Promise<Map<string, CardKit>> {
  const emblemUrl = ART['./art/emblem.webp'];
  const emblem = emblemUrl ? await loadImage(emblemUrl) : null;
  const kits = new Map<string, CardKit>();
  await Promise.all(
    defs.map(async (def) => {
      const url = ART[`./art/${def.file}`];
      const img = url ? await loadImage(url) : null;
      if (img && url) {
        kits.set(def.id, { front: finish(new THREE.Texture(img)), back: makeBack(img, img.naturalWidth, img.naturalHeight, emblem, def.accent), aspect: img.naturalWidth / img.naturalHeight, url });
      } else {
        const c = placeholder(def);
        kits.set(def.id, { front: finish(new THREE.CanvasTexture(c)), back: makeBack(c, c.width, c.height, emblem, def.accent), aspect: c.width / c.height, url: c.toDataURL() });
      }
    }),
  );
  return kits;
}

/**
 * The card as a solid object: front art, emblem back and a stack of dark silhouette layers between them that reads
 * as a cut edge. Origin at the bottom centre, front facing +Z. `glow` keeps the art readable in the blue-hour light.
 */
export function makeCardBody(kit: CardKit, height: number, glow: number): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(height * kit.aspect, height);
  geo.translate(0, height / 2, 0);
  const thick = height * 0.016;
  const face = (map: THREE.Texture): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.7, metalness: 0, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: glow });
  const front = new THREE.Mesh(geo, face(kit.front));
  front.position.z = thick / 2;
  const back = new THREE.Mesh(geo, face(kit.back));
  back.position.z = -thick / 2;
  back.rotation.y = Math.PI;
  group.add(front, back);
  const edge = new THREE.MeshStandardMaterial({ map: kit.front, color: 0x1b1626, alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide });
  for (let i = 1; i <= 4; i++) {
    const m = new THREE.Mesh(geo, edge);
    m.position.z = -thick / 2 + (thick * i) / 5;
    group.add(m);
  }
  return group;
}

/** Additive foil sweep laid over a card face (one material per card: it samples that card's alpha). */
export function makeFoil(kit: CardKit, accent: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: kit.front }, uTime: { value: 0 }, uTint: { value: new THREE.Color(accent) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform sampler2D map; uniform float uTime; uniform vec3 uTint; varying vec2 vUv;\n' +
      'void main() { float a = texture2D(map, vUv).a; float d = abs(fract(vUv.x * 0.55 + vUv.y * 0.45 - uTime * 0.3) - 0.5);\n' +
      'float band = smoothstep(0.1, 0.0, d); gl_FragColor = vec4(mix(vec3(1.0), uTint, 0.5) * band * 0.55 * a, 1.0); }',
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}
