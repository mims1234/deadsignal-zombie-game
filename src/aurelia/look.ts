/**
 * How Aurelia looks (client only): the stand-in VRoid model dressed in her colours until she has a model of her own,
 * her wings of gold flame (open when she rises, folded close while she walks), the column of fire she rises in, and the
 * red spider lily that opens where she fell.
 */
import * as THREE from 'three';
import type { AnimeTint } from '../anime/vrm';

/** The stand-in she wears (the idol's model: the lightest hair in the cast, so her red reads true). */
export const AURELIA_MODEL = 'victoria.vrm';

/** Red hair burning to orange, a white dress, ember sandals; her own eyes. */
export const AURELIA_TINT: AnimeTint = {
  key: 'aurelia',
  skin: 0xffffff,
  cloth: 0xffffff,
  hair: 0xd0302a,
  eyes: null,
  outlines: true,
  parts: [
    { match: /Onepice/i, color: 0xf2ece6, flat: true },
    { match: /Shoes/i, color: 0x8a3a22, flat: true },
    // the front locks and the ends: the phoenix's orange
    { match: /HAIR_02|HAIR_03/, color: 0xff7a2a },
  ],
};

const mats: THREE.Material[] = [];
function flame(color: number, opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  mats.push(m);
  return m;
}

/** A feather of flame: a long flat leaf, its base at the origin, pointing along +Y. */
function feather(len: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width, len * 0.35, width * 0.25, len);
  shape.quadraticCurveTo(-width * 0.4, len * 0.45, 0, 0);
  return new THREE.ShapeGeometry(shape, 6);
}

export interface AureliaWings {
  root: THREE.Group;
  /** `open` 0 (folded close, a faint glow) to 1 (spread wide and bright); `time` drives the beat. */
  update(open: number, time: number): void;
  dispose(): void;
}

/** Her wings: two fans of gold flame from between the shoulder blades, white-gold at the root. */
export function aureliaWings(): AureliaWings {
  const root = new THREE.Group();
  root.position.set(0, 1.36, 0.12);
  const geos: THREE.BufferGeometry[] = [];
  const layers: [number, number, number, THREE.MeshBasicMaterial][] = [
    [1.15, 0.26, 9, flame(0xff9a1a, 0.55)],
    [0.9, 0.22, 8, flame(0xffc84a, 0.6)],
    [0.55, 0.17, 6, flame(0xfff0c0, 0.7)],
  ];
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Group();
    w.position.x = side * 0.06;
    for (const [len, width, n, m] of layers) {
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const g = feather(len * (0.75 + 0.35 * Math.sin(t * Math.PI)), width);
        geos.push(g);
        const f = new THREE.Mesh(g, m);
        f.rotation.z = -side * (0.15 + t * 1.75);
        f.position.z = 0.01 * i;
        f.renderOrder = 3;
        w.add(f);
      }
    }
    root.add(w);
    return w;
  });
  const base = layers.map((l) => l[3].opacity);
  return {
    root,
    update(open, time) {
      const beat = Math.sin(time * (open > 0.5 ? 5 : 1.6)) * (0.06 + open * 0.1);
      wings.forEach((w, i) => {
        const side = i === 0 ? -1 : 1;
        w.rotation.y = side * (0.95 - open * 0.75 + beat);
        w.rotation.z = side * (open - 0.4) * 0.5;
        w.scale.setScalar(0.55 + open * 1.05);
      });
      layers.forEach((l, k) => (l[3].opacity = base[k]! * (0.25 + open * 0.75)));
      root.visible = open > 0.01;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const [, , , m] of layers) m.dispose();
      root.removeFromParent();
    },
  };
}

/** The column of fire she rises in: `t` 0..1 through the rising (it climbs, then thins away). */
export function risingPillar(): { root: THREE.Mesh; update(t: number, time: number): void; dispose(): void } {
  const geo = new THREE.CylinderGeometry(0.55, 0.9, 6, 20, 1, true).translate(0, 3, 0);
  const mat = flame(0xff7a2a, 0);
  const root = new THREE.Mesh(geo, mat);
  root.renderOrder = 3;
  root.visible = false;
  return {
    root,
    update(t, time) {
      root.visible = t > 0 && t < 1;
      if (!root.visible) return;
      const up = Math.min(1, t * 3);
      root.scale.set(1 + Math.sin(time * 9) * 0.05, up, 1 + Math.cos(time * 8) * 0.05);
      mat.opacity = 0.55 * (1 - t);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      root.removeFromParent();
    },
  };
}

/** The lilies' shapes and materials, made once and shared (never disposed). */
let lilyKit: { petal: THREE.BufferGeometry; stamen: THREE.BufferGeometry; stem: THREE.BufferGeometry; petalMat: THREE.Material; stamenMat: THREE.Material; stemMat: THREE.Material } | null = null;

/** One red spider lily, knee high, opening as `grow` goes 0 to 1 (shared shapes and materials). */
export function redLily(): { root: THREE.Group; grow(t: number): void } {
  lilyKit ??= (() => {
    const petal = new THREE.PlaneGeometry(0.07, 0.36, 1, 6).translate(0, 0.18, 0);
    const pos = petal.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = y / 0.36;
      pos.setX(i, pos.getX(i) * (1 - t * 0.7));
      pos.setZ(i, t * t * 0.14);
    }
    petal.computeVertexNormals();
    return {
      petal,
      stamen: new THREE.CylinderGeometry(0.004, 0.006, 0.42, 4).translate(0, 0.21, 0),
      stem: new THREE.CylinderGeometry(0.012, 0.016, 0.5, 5).translate(0, 0.25, 0),
      petalMat: new THREE.MeshStandardMaterial({ color: 0xd0182e, emissive: 0x7a0614, emissiveIntensity: 1, roughness: 0.55, side: THREE.DoubleSide }),
      stamenMat: new THREE.MeshBasicMaterial({ color: 0xff4a5a }),
      stemMat: new THREE.MeshStandardMaterial({ color: 0x2c4a22, roughness: 0.9 }),
    };
  })();
  const k = lilyKit;
  const root = new THREE.Group();
  root.add(new THREE.Mesh(k.stem, k.stemMat));
  const head = new THREE.Group();
  head.position.y = 0.5;
  root.add(head);
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(k.petal, k.petalMat);
    p.rotation.set(1.05, (i * Math.PI) / 3, 0, 'YXZ');
    head.add(p);
    const s = new THREE.Mesh(k.stamen, k.stamenMat);
    s.rotation.set(0.55, (i * Math.PI) / 3 + 0.5, 0, 'YXZ');
    head.add(s);
  }
  root.scale.setScalar(0.001);
  return {
    root,
    grow(t) {
      const e = 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
      root.scale.setScalar(Math.max(0.001, e * 1.6));
    },
  };
}
