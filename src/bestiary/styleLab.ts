/**
 * Style lab: the same two characters - a squad soldier and an infected - built in art styles that deliberately do NOT
 * match the game's look, to judge them side by side in the bestiary. Nothing here is used in the game.
 *
 * Every sample is one jointed figure (pelvis, torso, head, two-bone arms and legs, a rifle for soldiers) posed by one
 * shared procedural animation; a style only decides proportions and what each joint wears. Figures face -Z with +X
 * on their right, like the game's rigs, and implement `ZombieRig` so the bestiary drives them like any infected.
 */
import * as THREE from 'three';
import { type Dims, type Form, type JointName, type Style, StyleFigure } from '../anime/figure';

export { StyleFigure };

const HUMAN: Dims = { foot: 0.07, thigh: 0.44, shin: 0.43, torso: 0.52, neck: 0.06, head: 0.27, upper: 0.29, fore: 0.27, shoulderX: 0.2, hipX: 0.1, gun: 1 };

// ---------------------------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------------------------

/** A shape hanging down from its joint (limbs), or standing up from it (torso, head). */
const hang = <G extends THREE.BufferGeometry>(g: G, len: number): G => g.translate(0, -len / 2, 0) as G;
const stand = <G extends THREE.BufferGeometry>(g: G, len: number): G => g.translate(0, len / 2, 0) as G;
const capsule = (r: number, len: number, seg = 10): THREE.CapsuleGeometry => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, seg);
const pick = <T>(rnd: () => number, a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, pixel = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  } else t.anisotropy = 4;
  return t;
}

/** A simple rifle out of boxes along -Z, the grip at the origin, the muzzle 0.66 m ahead. */
function rifle(f: StyleFigure, mat: (part: 'metal' | 'poly' | 'accent') => THREE.Material, chunk = 1, outline?: THREE.Material): void {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * chunk, h * chunk, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    if (outline) {
      const o = new THREE.Mesh(mesh.geometry, outline);
      o.position.copy(mesh.position);
      o.scale.setScalar(1.12);
      o.userData.noShadow = true;
      g.add(o);
    }
  };
  box(0.05, 0.1, 0.22, 0, -0.02, 0.13, mat('poly')); // stock
  box(0.06, 0.09, 0.32, 0, 0, -0.14, mat('metal')); // receiver
  box(0.04, 0.11, 0.05, 0, -0.08, 0.0, mat('poly')); // grip
  box(0.04, 0.12, 0.06, 0, -0.09, -0.12, mat('accent')); // magazine
  box(0.055, 0.06, 0.22, 0, -0.01, -0.4, mat('poly')); // handguard
  box(0.025, 0.025, 0.16, 0, 0.0, -0.58, mat('metal')); // barrel
  box(0.03, 0.04, 0.08, 0, 0.07, -0.14, mat('accent')); // sight
  f.put('gun', g);
  f.grip.set(0, -0.08, 0.0);
  f.support.set(0, -0.05, -0.4);
}

function muzzleFlash(f: StyleFigure, mat: THREE.Material, size = 1): void {
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.07 * size, 0.28 * size, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.14 * size), mat);
  flash.userData.noShadow = true;
  f.flash = f.put('gun', flash, 0, 0, -0.66);
  flash.castShadow = false;
}

// ---------------------------------------------------------------------------------------------
// 1. cel-shaded comic: flat bands of colour, ink outlines, saturated palette
// ---------------------------------------------------------------------------------------------

let toonRamp: THREE.DataTexture | null = null;
function ramp(): THREE.DataTexture {
  if (!toonRamp) {
    toonRamp = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    toonRamp.magFilter = toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
    toonRamp.userData.keep = true;
  }
  return toonRamp;
}

function inkMaterial(thick: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x0c0a10, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${thick.toFixed(4)};`);
  };
  return m;
}

const comic: Style = {
  id: 'comic',
  name: 'Cel-shaded comic',
  tagline: 'Three flat bands of light and an ink line.',
  lore: 'Borderlands-style: hard light-to-shadow steps instead of soft shading, a black outline around every shape, chunky hands and boots, loud colours. Reads instantly at any distance and hides low polygon counts; the whole game world would need the same treatment or the characters float on top of it.',
  notes: 'Toon material + inverted-hull outline (each part drawn twice)',
  dims: (form) => ({ ...HUMAN, shoulderX: form === 'squad' ? 0.23 : 0.19, head: 0.29, gun: 1.1 }),
  dress(f, form, rnd) {
    const D = f.D;
    const toon = (c: number, emissive = 0): THREE.MeshToonMaterial => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp(), emissive, emissiveIntensity: emissive ? 1.5 : 0 });
    const ink = inkMaterial(0.012);
    const part = (j: JointName, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, inked = true): THREE.Mesh => {
      const m = f.put(j, new THREE.Mesh(geo, mat), x, y, z);
      if (inked) {
        const o = new THREE.Mesh(geo, ink);
        o.userData.noShadow = true;
        m.add(o);
        o.castShadow = false;
      }
      return m;
    };
    const zombie = form === 'zombie';
    const skin = toon(zombie ? pick(rnd, [0x8fc46a, 0x9ab86e, 0x7fb59a]) : pick(rnd, [0xf0c8a0, 0xc68b5e, 0x8d5a3a]));
    const shirt = toon(zombie ? pick(rnd, [0x7a4fb0, 0xc0472f, 0x2f7ac0]) : pick(rnd, [0x2bb5a6, 0x3a8fd9]));
    const pants = toon(zombie ? 0x4a5a78 : 0x3d4a2f);
    const gear = toon(zombie ? 0x5b3a2a : pick(rnd, [0xf28a1e, 0xe8c12a, 0xe8452a]));
    const dark = toon(0x2a2a30);
    const r = 0.075;
    // torso: a tapered capsule, wide at the chest
    const chest = capsule(0.17, D.torso * 0.8, 12).scale(form === 'squad' ? 1.35 : 1.05, 1, 0.8);
    part('torso', stand(chest, D.torso * 0.8), shirt, 0, 0.02);
    part('pelvis', capsule(0.15, 0.22, 10).scale(1.1, 1, 0.8), pants, 0, -0.02);
    // head: a big round head, cartoon eyes
    part('head', new THREE.SphereGeometry(D.head * 0.55, 20, 14).scale(1, 1.08, 1), skin, 0, D.head * 0.5);
    const eyeW = toon(0xffffff);
    if (zombie) {
      // mismatched glowing eyes and a slack jaw
      part('head', new THREE.SphereGeometry(0.045, 12, 8), toon(0xfff26a, 0xffd23a), -0.06, D.head * 0.58, -0.13, false);
      part('head', new THREE.SphereGeometry(0.03, 10, 8), toon(0xfff26a, 0xffd23a), 0.065, D.head * 0.52, -0.135, false);
      part('head', new THREE.BoxGeometry(0.13, 0.06, 0.06), dark, 0.0, D.head * 0.2, -0.12);
      part('head', new THREE.BoxGeometry(0.03, 0.03, 0.02), eyeW, -0.03, D.head * 0.24, -0.15, false);
      part('head', new THREE.BoxGeometry(0.03, 0.03, 0.02), eyeW, 0.03, D.head * 0.24, -0.15, false);
      // tufts of hair
      for (let i = 0; i < 4; i++) part('head', new THREE.ConeGeometry(0.03, 0.12, 6), toon(0x3a2a20), (rnd() - 0.5) * 0.14, D.head + 0.02, (rnd() - 0.5) * 0.1);
    } else {
      for (const s of [-1, 1]) {
        part('head', new THREE.SphereGeometry(0.04, 12, 8).scale(1, 1.3, 0.6), eyeW, s * 0.055, D.head * 0.55, -0.13, false);
        part('head', new THREE.SphereGeometry(0.018, 8, 6), dark, s * 0.05, D.head * 0.55, -0.155, false);
      }
      // helmet + goggles on the brim
      part('head', new THREE.SphereGeometry(D.head * 0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), gear, 0, D.head * 0.62);
      part('head', new THREE.TorusGeometry(D.head * 0.6, 0.025, 6, 20).rotateX(Math.PI / 2), dark, 0, D.head * 0.62);
      part('head', new THREE.BoxGeometry(0.2, 0.06, 0.06), toon(0x6af0ff, 0x2a8fa0), 0, D.head * 0.82, -0.14);
      // armour vest + pouches
      part('torso', stand(new THREE.BoxGeometry(0.4, D.torso * 0.55, 0.3), D.torso * 0.55), gear, 0, D.torso * 0.25);
      for (const s of [-1, 0, 1]) part('torso', new THREE.BoxGeometry(0.08, 0.1, 0.06), dark, s * 0.11, D.torso * 0.38, -0.17);
      part('torso', new THREE.BoxGeometry(0.24, 0.12, 0.12), dark, 0, D.torso * 0.75, 0.18); // backpack top
    }
    // limbs: tapered capsules, chunky fists and boots
    for (const s of ['L', 'R'] as const) {
      const side = s === 'L' ? -1 : 1;
      part(`arm${s}`, hang(capsule(r, D.upper + r), D.upper + r), zombie ? skin : shirt, 0, r * 0.5);
      part(`fore${s}`, hang(capsule(r * 0.9, D.fore + r), D.fore + r), skin, 0, r * 0.5);
      part(`fore${s}`, new THREE.SphereGeometry(0.075, 12, 10).scale(1, 1.1, 1), zombie ? skin : dark, 0, -D.fore - 0.03);
      if (zombie) for (let i = 0; i < 3; i++) part(`fore${s}`, new THREE.ConeGeometry(0.015, 0.07, 5).rotateX(Math.PI), toon(0xe8e0c0), (i - 1) * 0.03, -D.fore - 0.11, -0.03);
      part(`leg${s}`, hang(capsule(r * 1.15, D.thigh + r), D.thigh + r), pants, 0, r * 0.5);
      part(`shin${s}`, hang(capsule(r, D.shin), D.shin), pants, 0, 0);
      part(`shin${s}`, new THREE.BoxGeometry(0.15, 0.1, 0.27).translate(0, 0, -0.05), dark, 0, -D.shin - D.foot * 0.3);
      if (!zombie) part(`arm${s}`, new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), gear, side * 0.01, 0.02);
    }
    if (zombie) {
      // torn shirt: a ragged hem and a bite out of the shoulder
      for (let i = 0; i < 5; i++) part('torso', new THREE.ConeGeometry(0.05, 0.12, 4).rotateX(Math.PI), shirt, -0.16 + i * 0.08, -0.02, (rnd() - 0.5) * 0.12);
      part('torso', new THREE.SphereGeometry(0.06, 10, 8), toon(0xb83a3a), 0.12, D.torso * 0.85, -0.09, false);
    } else {
      rifle(f, (p) => (p === 'metal' ? dark : p === 'poly' ? toon(0x4a4a52) : gear), 1.15, inkMaterial(0.008));
      muzzleFlash(f, new THREE.MeshBasicMaterial({ color: 0xfff07a }), 1.3);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// 2. voxel: blocks with pixel-art skins, one-piece limbs
// ---------------------------------------------------------------------------------------------

/** A box skinned with a pixel-art texture per face (front = -Z). */
function pixelBox(w: number, h: number, d: number, faces: { front?: THREE.Texture; other: THREE.Texture; top?: THREE.Texture }): THREE.Mesh {
  const m = (t: THREE.Texture): THREE.Material => new THREE.MeshLambertMaterial({ map: t });
  const other = m(faces.other);
  // +x, -x, +y, -y, +z (back), -z (front)
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [other, other, faces.top ? m(faces.top) : other, other, other, faces.front ? m(faces.front) : other]);
}

/** Pixel art from rows of characters, one colour per letter, scattered with a little noise. */
function pixels(rows: string[], pal: Record<string, number>, rnd: () => number, noise = 0.08): THREE.CanvasTexture {
  const h = rows.length;
  const w = rows[0]!.length;
  return canvasTex(
    w,
    h,
    (g) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = new THREE.Color(pal[rows[y]![x]!] ?? 0xff00ff);
          c.offsetHSL(0, 0, (rnd() - 0.5) * noise);
          g.fillStyle = `#${c.getHexString()}`;
          g.fillRect(x, y, 1, 1);
        }
      }
    },
    true,
  );
}

const fill = (ch: string, w: number, h: number): string[] => Array.from({ length: h }, () => ch.repeat(w));

const voxel: Style = {
  id: 'voxel',
  name: 'Voxel',
  tagline: 'Blocks, pixel-art skins, no elbows.',
  lore: 'Minecraft-like: every part a box with an 8-by-8 painted face, limbs that swing stiff from the shoulder and hip. Cheap to make and to draw, charming rather than frightening - the horror would have to come from numbers and sound instead of looks. Pairs best with a blocky world.',
  notes: 'Boxes with tiny nearest-filtered textures; 10 parts',
  stiff: true,
  dims: () => ({ foot: 0, thigh: 0.36, shin: 0.36, torso: 0.66, neck: 0, head: 0.46, upper: 0.66, fore: 0.01, shoulderX: 0.38, hipX: 0.125, gun: 1 }),
  dress(f, form, rnd) {
    const D = f.D;
    const zombie = form === 'zombie';
    const skin = zombie ? 0x4f8a3c : pick(rnd, [0xd8a07a, 0xa86e48, 0x6e4228]);
    const P: Record<string, number> = {
      s: skin,
      d: zombie ? 0x3a6a2c : 0x8a5a40,
      e: zombie ? 0x101010 : 0xffffff,
      p: zombie ? 0xd02020 : 0x3050a0,
      m: zombie ? 0x2a1010 : 0x7a3a2a,
      h: zombie ? 0x2d4a24 : 0x5a3a20,
      g: 0x5a6a3a, // helmet olive
      G: 0x46542c,
      c: zombie ? pick(rnd, [0x3a9aa0, 0x6a4a9a]) : 0x5f7040, // shirt
      C: zombie ? 0x2a6a70 : 0x4a5830,
      b: zombie ? 0x3040a0 : 0x3a3a2a, // trousers
      B: 0x2a2a20,
      k: 0x222222,
      r: 0x8a1a1a,
      v: 0x7a6a4a,
    };
    const face = zombie
      ? ['hhhhhhhh', 'hsssshsh', 'ssssssss', 'seekseek', 'sssdssss', 'ssmmmmss', 'sdmrrmds', 'ssssssss']
      : ['gggggggg', 'gGGGGGGg', 'ssssssss', 'sepsseps', 'ssssssss', 'sssddsss', 'ssmmmmss', 'ssssssss'];
    const headSide = zombie ? ['hhhhhhhh', 'hhhhsshh', ...fill('s', 8, 4), 'ssssdsss', 'ssssssss'] : ['gggggggg', 'gGGGGGGg', 'gGsssssg', ...fill('s', 8, 5)];
    const top = zombie ? ['hhhhhhhh', 'hhhdhhhh', 'hhhhhhrh', ...fill('h', 8, 5)] : fill('g', 8, 8);
    const T = (rows: string[]): THREE.CanvasTexture => pixels(rows, P, rnd);
    const hs = D.head;
    f.put('head', pixelBox(hs, hs, hs, { front: T(face), other: T(headSide), top: T(top) }), 0, hs / 2, 0);
    const shirtFront = zombie ? ['cccccccc', 'cccCcccc', 'ccrccccc', 'ccccccCc', 'csscccrc', 'cssccccc', 'ccccsscc', 'cccccssc'] : ['cccccccc', 'cvvvvvvc', 'cvkvvkvc', 'cvvvvvvc', 'cvkvvkvc', 'cvvvvvvc', 'BBBBBBBB', 'cccccccc'];
    f.put('torso', pixelBox(0.52, D.torso, 0.28, { front: T(shirtFront), other: T(zombie ? ['cccccccc', 'cCcccccc', ...fill('c', 8, 6)] : fill('c', 8, 8)) }), 0, D.torso / 2, 0);
    const armRows = zombie ? ['cccc', 'cccc', 'ssss', 'ssss', 'sdss', 'ssss', 'ssss', 'ssds'] : ['cccc', 'cccc', 'cccc', 'cCcc', 'cccc', 'cccc', 'ssss', 'ssss'];
    const legRows = zombie ? ['bbbb', 'bbbb', 'bBbb', 'bbbb', 'bbss', 'bbbs', 'ssss', 'kkkk'] : ['bbbb', 'bBbb', 'bbbb', 'bbbb', 'bbbB', 'bbbb', 'kkkk', 'kkkk'];
    for (const s of ['L', 'R'] as const) {
      // the arm's top sits flush with the shoulders
      f.put(`arm${s}`, pixelBox(0.24, D.upper, 0.24, { other: T(armRows) }), 0, -D.upper / 2 + 0.063, 0);
      f.put(`leg${s}`, pixelBox(0.25, D.thigh + D.shin, 0.25, { other: T(legRows) }), 0, -(D.thigh + D.shin) / 2, 0);
    }
    if (!zombie) {
      const k = new THREE.MeshLambertMaterial({ map: pixels(fill('k', 2, 2), P, rnd, 0.2) });
      const olive = new THREE.MeshLambertMaterial({ map: pixels(['gG', 'Gg'], P, rnd, 0.2) });
      rifle(f, (p) => (p === 'metal' ? k : olive), 1.3);
      muzzleFlash(f, new THREE.MeshBasicMaterial({ color: 0xffe066 }), 1.2);
      // blocky hands meet the gun: the arms end in the box itself
      f.grip.set(0, -0.08, 0.02);
      f.support.set(0, -0.08, -0.36);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// 3. vinyl toy: chibi proportions, glossy plastic
// ---------------------------------------------------------------------------------------------

const vinyl: Style = {
  id: 'vinyl',
  name: 'Vinyl toy',
  tagline: 'Big heads, glossy plastic, collectible-figure cute.',
  lore: 'Chibi proportions - a head as big as the body - in shiny clearcoat plastic, like designer toys on a shelf. Cute soldiers against cute infected makes a lighter, more arcade game; gore becomes stuffing and stitches. Heads this big also make headshots trivially easy, so balance would shift.',
  notes: 'Physical material with clearcoat; soft shapes only',
  dims: (form) => ({ foot: 0.06, thigh: 0.2, shin: 0.17, torso: 0.36, neck: 0.01, head: 0.56, upper: 0.17, fore: 0.15, shoulderX: 0.17, hipX: 0.08, gun: form === 'squad' ? 0.82 : 1 }),
  dress(f, form, rnd) {
    const D = f.D;
    const zombie = form === 'zombie';
    const plastic = (c: number, extra: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.12, ...extra });
    const skin = plastic(zombie ? pick(rnd, [0x9fe0c0, 0xb8d88a, 0xc0b0e8]) : pick(rnd, [0xffd9be, 0xe0a882, 0x9a6648]));
    const suit = plastic(zombie ? pick(rnd, [0xf08aa0, 0x8ab8f0, 0xf0c060]) : pick(rnd, [0x6f8f4a, 0x4a6f8f, 0x8f6a4a]));
    const black = plastic(0x18181c, { roughness: 0.2 });
    const white = plastic(0xffffff, { roughness: 0.2 });
    const put = (j: JointName, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => f.put(j, new THREE.Mesh(g, m), x, y, z);
    const hr = D.head * 0.5;
    put('head', new THREE.SphereGeometry(hr, 32, 24).scale(1.08, 0.96, 1), skin, 0, hr);
    put('torso', stand(capsule(0.15, D.torso + 0.06, 16).scale(1.1, 1, 0.9), D.torso + 0.06), suit, 0, -0.04);
    put('pelvis', new THREE.SphereGeometry(0.16, 16, 12).scale(1.05, 0.7, 0.9), suit, 0, 0.0);
    for (const s of ['L', 'R'] as const) {
      put(`arm${s}`, hang(capsule(0.055, D.upper + 0.05), D.upper + 0.05), suit, 0, 0.03);
      put(`fore${s}`, hang(capsule(0.05, D.fore), D.fore), zombie ? skin : suit);
      put(`fore${s}`, new THREE.SphereGeometry(0.065, 16, 12), skin, 0, -D.fore - 0.02);
      put(`leg${s}`, hang(capsule(0.07, D.thigh + 0.05), D.thigh + 0.05), suit, 0, 0.03);
      put(`shin${s}`, hang(capsule(0.065, D.shin), D.shin), zombie ? suit : black);
      put(`shin${s}`, new THREE.SphereGeometry(0.09, 16, 10).scale(1, 0.6, 1.4), black, 0, -D.shin - D.foot * 0.3, -0.03);
    }
    if (zombie) {
      // one button eye, one big stitched-cross eye, stitched grin, a brain peeking out
      const eyeY = hr * 0.95;
      put('head', new THREE.SphereGeometry(0.08, 20, 14).scale(1, 1, 0.5), white, -0.1, eyeY, -hr * 0.88);
      put('head', new THREE.SphereGeometry(0.03, 12, 8), black, -0.1, eyeY - 0.01, -hr * 0.93);
      for (const a of [Math.PI / 4, -Math.PI / 4]) put('head', new THREE.BoxGeometry(0.11, 0.025, 0.03).rotateZ(a), black, 0.1, eyeY, -hr * 0.9);
      put('head', new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI).rotateZ(Math.PI), black, 0, hr * 0.62, -hr * 0.9);
      for (let i = -2; i <= 2; i++) put('head', new THREE.BoxGeometry(0.01, 0.045, 0.02), black, i * 0.028, hr * 0.62 - 0.05 * Math.cos((i / 3) * 1.2) + 0.02, -hr * 0.92);
      const brain = plastic(0xf4a0b8);
      for (let i = 0; i < 6; i++) put('head', new THREE.SphereGeometry(0.06 + rnd() * 0.02, 14, 10), brain, (rnd() - 0.5) * 0.2, hr * 1.78 + rnd() * 0.02, (rnd() - 0.3) * 0.16);
      // a patch and stitches on the belly
      put('torso', new THREE.BoxGeometry(0.12, 0.1, 0.02).rotateZ(0.3), plastic(0xf0e070), 0.06, D.torso * 0.45, -0.14);
      for (let i = 0; i < 4; i++) put('torso', new THREE.BoxGeometry(0.06, 0.012, 0.012).rotateZ(0.5), black, -0.08, D.torso * 0.3 + i * 0.035, -0.15);
    } else {
      // big shiny eyes, rosy cheeks, a round helmet and a backpack
      for (const s of [-1, 1]) {
        put('head', new THREE.SphereGeometry(0.055, 20, 14).scale(0.85, 1.2, 0.5), black, s * 0.1, hr * 0.92, -hr * 0.9);
        put('head', new THREE.SphereGeometry(0.016, 8, 6), white, s * 0.1 + 0.015, hr * 0.98, -hr * 0.96);
        put('head', new THREE.SphereGeometry(0.035, 12, 8).scale(1, 0.6, 0.3), plastic(0xff9a9a, { roughness: 0.6, clearcoat: 0.3 }), s * 0.17, hr * 0.7, -hr * 0.85);
      }
      put('head', new THREE.SphereGeometry(hr * 1.07, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), suit, 0, hr * 1.05);
      put('head', new THREE.TorusGeometry(hr * 1.02, 0.025, 8, 28).rotateX(Math.PI / 2), suit, 0, hr * 1.12);
      put('torso', new THREE.BoxGeometry(0.24, 0.24, 0.12).translate(0, 0, 0), plastic(0x5a4a3a), 0, D.torso * 0.5, 0.16);
      put('torso', new THREE.SphereGeometry(0.05, 12, 8), plastic(0xffd040), 0, D.torso * 0.62, -0.15);
      rifle(f, (p) => (p === 'metal' ? black : p === 'poly' ? plastic(0x3a3a40) : plastic(0xffd040)), 1.25);
      muzzleFlash(f, new THREE.MeshBasicMaterial({ color: 0xffef9a }), 1.1);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// 4. hologram: a tactical simulation - glowing fresnel shells, wire edges, scanlines
// ---------------------------------------------------------------------------------------------

function holoMaterial(color: number, clock: { value: number }, strength = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: clock, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vY = wp.y;
        vec4 mv = viewMatrix * wp;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform float uStrength;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float scan = 0.55 + 0.45 * step(0.45, fract(vY * 38.0 - uTime * 1.6));
        float band = smoothstep(0.0, 0.08, abs(fract(vY * 0.35 - uTime * 0.25) - 0.5));
        float a = (0.07 + f * 0.85) * scan * (0.75 + 0.25 * band) * uStrength;
        gl_FragColor = vec4(uColor * (0.5 + f * 1.8), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const hologram: Style = {
  id: 'hologram',
  name: 'Hologram',
  tagline: 'A tactical simulation: light, wire and scanlines.',
  lore: 'Everything rendered as a projected training sim - faceted shapes with glowing edges and rim light, no solid surfaces, no shadows. It would frame the whole game as a drill or a memory replay, and it makes enemies easy to read in the dark. The infected glitch and stutter; the soldier holds steady.',
  notes: 'Custom fresnel shader + edge lines; additive, no shadows',
  dims: () => ({ ...HUMAN }),
  dress(f, form, rnd) {
    const D = f.D;
    const zombie = form === 'zombie';
    const color = zombie ? pick(rnd, [0xff3a5a, 0xff4ad0]) : pick(rnd, [0x3ad8ff, 0x4affb0]);
    const clock = { value: 0 };
    f.uniforms.push(clock);
    const shell = holoMaterial(color, clock);
    const wire = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const part = (j: JointName, g: THREE.BufferGeometry, x = 0, y = 0, z = 0): void => {
      const m = new THREE.Mesh(g, shell);
      m.userData.noShadow = true;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), wire));
      f.put(j, m, x, y, z);
      m.castShadow = m.receiveShadow = false;
    };
    const cyl = (r0: number, r1: number, len: number, seg = 6): THREE.CylinderGeometry => new THREE.CylinderGeometry(r0, r1, len, seg);
    part('head', new THREE.IcosahedronGeometry(D.head * 0.52, 1).scale(0.9, 1.1, 1), 0, D.head * 0.5);
    part('torso', stand(cyl(0.2, 0.15, D.torso, 7).scale(1, 1, 0.65), D.torso));
    part('pelvis', cyl(0.15, 0.13, 0.16, 7).scale(1, 1, 0.7), 0, -0.04);
    for (const s of ['L', 'R'] as const) {
      part(`arm${s}`, hang(cyl(0.065, 0.055, D.upper), D.upper));
      part(`fore${s}`, hang(cyl(0.055, 0.045, D.fore), D.fore));
      part(`fore${s}`, new THREE.OctahedronGeometry(0.06, 0), 0, -D.fore - 0.04);
      part(`leg${s}`, hang(cyl(0.09, 0.07, D.thigh), D.thigh));
      part(`shin${s}`, hang(cyl(0.07, 0.05, D.shin), D.shin));
      part(`shin${s}`, new THREE.BoxGeometry(0.12, 0.08, 0.24), 0, -D.shin - 0.02, -0.05);
    }
    if (zombie) {
      // a broken jaw and a hollow where the ribs should be
      part('head', new THREE.TetrahedronGeometry(0.08, 0).rotateZ(0.6), 0.05, D.head * 0.1, -0.08);
      part('torso', new THREE.TorusGeometry(0.1, 0.01, 4, 10).rotateY(Math.PI / 2).rotateZ(Math.PI / 2), 0, D.torso * 0.6, -0.08);
    } else {
      part('head', new THREE.BoxGeometry(0.2, 0.05, 0.05), 0, D.head * 0.6, -0.13);
      part('torso', stand(new THREE.BoxGeometry(0.38, D.torso * 0.5, 0.28), D.torso * 0.5), 0, D.torso * 0.3);
      part('gun', new THREE.BoxGeometry(0.05, 0.1, 0.8).translate(0, 0, -0.25));
      part('gun', new THREE.BoxGeometry(0.04, 0.13, 0.06), 0, -0.09, -0.12);
      f.grip.set(0, -0.08, 0.02);
      f.support.set(0, -0.05, -0.38);
      const flash = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.15), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      flash.userData.noShadow = true;
      f.flash = f.put('gun', flash, 0, 0, -0.66);
      flash.castShadow = false;
    }
    // the projector disc they stand on
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.userData.noShadow = true;
    disc.userData.dress = true;
    disc.position.y = 0.005;
    f.root.add(disc);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.05, 40, 1, true), holoMaterial(color, clock, 0.6));
    cone.userData.dress = true;
    cone.userData.noShadow = true;
    cone.position.y = 0.025;
    f.root.add(cone);
  },
  tick(f, time) {
    if (f.form !== 'zombie') return;
    // glitch: every so often the figure tears sideways for a frame or two
    const g = Math.sin(time * 7.3) * Math.sin(time * 3.1);
    const tear = g > 0.86 ? (g - 0.86) * 2.2 : 0;
    f.J.torso.position.x = tear * (Math.sin(time * 90) > 0 ? 1 : -1);
    f.J.head.position.x = -tear * 0.6;
  },
};

// ---------------------------------------------------------------------------------------------
// 5. paper cut-out: flat painted card pieces, white die-cut borders
// ---------------------------------------------------------------------------------------------

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** A flat card piece facing -Z: painted with `draw`, inside a white die-cut border. */
function paperPiece(w: number, h: number, draw: Draw, anchor: 'top' | 'bottom' | 'center', round = 0.3): THREE.Mesh {
  const PX = 220;
  const cw = Math.ceil(w * PX) + 16;
  const ch = Math.ceil(h * PX) + 16;
  const tex = canvasTex(cw, ch, (g) => {
    const r = Math.min(cw, ch) * round;
    const shape = (inset: number): void => {
      g.beginPath();
      g.roundRect(inset, inset, cw - inset * 2, ch - inset * 2, Math.max(1, r - inset));
    };
    shape(2);
    g.fillStyle = '#fbf7ee';
    g.fill();
    g.save();
    shape(9);
    g.clip();
    g.translate(9, 9);
    draw(g, cw - 18, ch - 18);
    g.restore();
  });
  const geo = new THREE.PlaneGeometry(w + 16 / PX, h + 16 / PX).rotateY(Math.PI);
  if (anchor === 'top') geo.translate(0, -h / 2, 0);
  if (anchor === 'bottom') geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 }));
  // card backs: plain kraft, cut to the same shape
  const cut = canvasTex(cw, ch, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(2, 2, cw - 4, ch - 4, Math.max(1, Math.min(cw, ch) * round - 2));
    g.fill();
  });
  const back = new THREE.Mesh(geo.clone().rotateY(Math.PI), new THREE.MeshLambertMaterial({ color: 0xc8b48a, alphaMap: cut, alphaTest: 0.5 }));
  back.position.z = 0.002;
  m.add(back);
  return m;
}

const paper: Style = {
  id: 'paper',
  name: 'Paper cut-out',
  tagline: 'Painted card pieces on split pins.',
  lore: 'Paper Mario / South Park: every body part a flat painted card with a white die-cut edge, jointed like a puppet. Turn the camera and they go wafer-thin; they fall flat when they die. Very distinctive and very cheap - but it fights a first-person 3D shooter, where you mostly see enemies straight on anyway.',
  notes: 'Canvas-painted planes, alpha-tested; 2 quads per part',
  dims: () => ({ foot: 0.06, thigh: 0.4, shin: 0.4, torso: 0.56, neck: 0.03, head: 0.36, upper: 0.3, fore: 0.28, shoulderX: 0.2, hipX: 0.09, gun: 1.05 }),
  dress(f, form, rnd) {
    const D = f.D;
    const zombie = form === 'zombie';
    const skin = zombie ? pick(rnd, ['#9cc28a', '#a8b8a0', '#b4c47a']) : pick(rnd, ['#f2c8a4', '#c78a5c', '#8a5634']);
    const shirt = zombie ? pick(rnd, ['#d8d0b8', '#9ab0d0', '#d0a0a0']) : '#6b7d48';
    const pants = zombie ? '#46506a' : '#55623a';
    const ink = '#2a2420';
    const blot = (g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void => {
      g.fillStyle = c;
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const rr = r * (0.7 + rnd() * 0.5);
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    };
    const paint = (base: string, extra?: Draw): Draw => (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      // paper grain
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(0,0,0,${rnd() * 0.05})`;
        g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 1);
      }
      extra?.(g, w, h);
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, w - 3, h - 3);
    };
    // head
    f.put(
      'head',
      paperPiece(
        0.3,
        D.head,
        paint(skin, (g, w, h) => {
          g.fillStyle = ink;
          if (zombie) {
            // X eye, hollow eye, stitched mouth, blood
            g.lineWidth = 6;
            g.strokeStyle = ink;
            g.beginPath();
            g.moveTo(w * 0.22, h * 0.36);
            g.lineTo(w * 0.4, h * 0.5);
            g.moveTo(w * 0.4, h * 0.36);
            g.lineTo(w * 0.22, h * 0.5);
            g.stroke();
            g.fillStyle = '#fff6c0';
            g.beginPath();
            g.arc(w * 0.68, h * 0.44, w * 0.11, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = ink;
            g.beginPath();
            g.arc(w * 0.7, h * 0.46, w * 0.035, 0, Math.PI * 2);
            g.fill();
            g.fillRect(w * 0.25, h * 0.72, w * 0.5, 5);
            for (let i = 0; i < 6; i++) g.fillRect(w * (0.28 + i * 0.08), h * 0.68, 3, h * 0.09);
            blot(g, w * 0.8, h * 0.18, w * 0.08, '#8a1c1c');
            g.fillStyle = '#5a6a40';
            g.fillRect(0, 0, w, h * 0.16);
          } else {
            g.fillStyle = '#5c6b3c';
            g.fillRect(0, 0, w, h * 0.3);
            g.fillStyle = '#3e4a28';
            g.fillRect(0, h * 0.26, w, h * 0.06);
            g.fillStyle = ink;
            for (const x of [0.33, 0.67]) {
              g.beginPath();
              g.ellipse(w * x, h * 0.52, w * 0.045, h * 0.07, 0, 0, Math.PI * 2);
              g.fill();
            }
            g.lineWidth = 4;
            g.strokeStyle = ink;
            g.beginPath();
            g.arc(w * 0.5, h * 0.66, w * 0.14, 0.3, Math.PI - 0.3);
            g.stroke();
          }
        }),
        'bottom',
        0.45,
      ),
      0,
      0,
      -0.004,
    );
    // torso
    f.put(
      'torso',
      paperPiece(
        0.42,
        D.torso,
        paint(shirt, (g, w, h) => {
          if (zombie) {
            g.fillStyle = '#e8e0c8';
            g.fillRect(w * 0.42, 0, w * 0.16, h);
            blot(g, w * 0.3, h * 0.55, w * 0.12, '#8a1c1c');
            blot(g, w * 0.66, h * 0.3, w * 0.07, '#6a1414');
            // torn hem
            g.fillStyle = '#fbf7ee';
            for (let i = 0; i < 7; i++) {
              g.beginPath();
              g.moveTo((i / 7) * w, h);
              g.lineTo(((i + 0.5) / 7) * w, h - 14 - rnd() * 18);
              g.lineTo(((i + 1) / 7) * w, h);
              g.fill();
            }
          } else {
            g.fillStyle = '#3e4a28';
            g.fillRect(w * 0.08, h * 0.12, w * 0.84, h * 0.62);
            g.fillStyle = '#2a321c';
            for (const x of [0.18, 0.42, 0.66]) g.fillRect(w * x, h * 0.36, w * 0.16, h * 0.14);
            g.fillStyle = '#c8b46a';
            g.fillRect(w * 0.08, h * 0.8, w * 0.84, h * 0.08);
          }
        }),
        'bottom',
        0.18,
      ),
      0,
      -0.02,
      0,
    );
    // limbs: the right side in front of the body, the left behind
    for (const s of ['L', 'R'] as const) {
      const z = s === 'R' ? -0.012 : 0.012;
      f.put(`arm${s}`, paperPiece(0.12, D.upper + 0.06, paint(zombie ? skin : shirt), 'top', 0.5), 0, 0.04, z);
      f.put(`fore${s}`, paperPiece(0.11, D.fore + 0.06, paint(skin, zombie ? (g, w, h) => blot(g, w * 0.5, h * 0.5, w * 0.25, '#7a8a5a') : undefined), 'top', 0.5), 0, 0.03, z);
      f.put(`leg${s}`, paperPiece(0.15, D.thigh + 0.06, paint(pants), 'top', 0.35), 0, 0.05, z * 0.5);
      f.put(
        `shin${s}`,
        paperPiece(
          0.14,
          D.shin + D.foot + 0.04,
          paint(pants, (g, w, h) => {
            g.fillStyle = zombie ? skin : '#2a2420';
            g.fillRect(0, h * 0.82, w, h * 0.18);
          }),
          'top',
          0.35,
        ),
        0,
        0.02,
        z * 0.5,
      );
    }
    if (!zombie) {
      const gunPiece = paperPiece(
        0.9,
        0.2,
        (g, w, h) => {
          g.fillStyle = '#2b2b2b';
          g.fillRect(0, h * 0.25, w * 0.85, h * 0.35);
          g.fillRect(w * 0.85, h * 0.35, w * 0.15, h * 0.12);
          g.fillStyle = '#5a4a32';
          g.fillRect(0, h * 0.2, w * 0.2, h * 0.6);
          g.fillStyle = '#3a3a3a';
          g.fillRect(w * 0.42, h * 0.55, w * 0.08, h * 0.45);
        },
        'center',
        0.1,
      );
      // a side-view card along the barrel: edge-on from the front, a rifle from the side
      gunPiece.rotation.y = Math.PI / 2;
      f.put('gun', gunPiece, 0, 0, -0.25);
      f.grip.set(0, -0.06, 0.02);
      f.support.set(0, -0.04, -0.38);
      const flash = paperPiece(
        0.22,
        0.22,
        (g, w, h) => {
          g.fillStyle = '#ffd23a';
          g.beginPath();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const r = (i % 2 ? 0.25 : 0.5) * w;
            g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
          }
          g.fill();
        },
        'center',
        0.5,
      );
      flash.userData.noShadow = true;
      f.flash = f.put('gun', flash, 0, 0, -0.72);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// 6. PS1 retro horror: few polygons, wobbling vertices, low-res texture, chunky pixels
// ---------------------------------------------------------------------------------------------

const SNAP = { value: 90 };
function psxMaterial(map: THREE.Texture): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSnap = SNAP;
    sh.vertexShader = `uniform float uSnap;\n${sh.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>\n  vec4 sp = gl_Position; sp.xyz /= sp.w; sp.xy = floor(sp.xy * uSnap + 0.5) / uSnap; sp.xyz *= sp.w; gl_Position = sp;`,
    );
  };
  return m;
}

function grime(base: number, rnd: () => number, extra?: Draw, size = 16): THREE.CanvasTexture {
  return canvasTex(
    size,
    size,
    (g, w, h) => {
      const c = new THREE.Color(base);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const k = c.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.12);
          g.fillStyle = `#${k.getHexString()}`;
          g.fillRect(x, y, 1, 1);
        }
      }
      extra?.(g, w, h);
    },
    true,
  );
}

const psx: Style = {
  id: 'psx',
  name: 'PS1 retro horror',
  tagline: 'Wobbling polygons and crunchy pixels.',
  lore: 'Late-90s console horror (and the indie revival of it): a handful of flat-shaded polygons, vertices that snap to a coarse grid and shiver as you move, 16-pixel textures, and the whole screen drawn at a fraction of its resolution. Uncanny and very cheap to run; it suits fog, darkness and dread better than the open firefights.',
  notes: 'Vertex snapping shader; view rendered at ~30% resolution',
  pixel: 0.3,
  dims: () => ({ ...HUMAN, head: 0.26 }),
  dress(f, form, rnd) {
    const D = f.D;
    const zombie = form === 'zombie';
    const skinC = zombie ? pick(rnd, [0x8a8a78, 0x7a8470, 0x9a8a80]) : pick(rnd, [0xc89a78, 0x8a6044]);
    const blood = '#5a0e0e';
    const skin = psxMaterial(grime(skinC, rnd, zombie ? (g, w, h) => {
      g.fillStyle = blood;
      g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 3, 2);
    } : undefined));
    const face = psxMaterial(
      grime(skinC, rnd, (g, w, h) => {
        g.fillStyle = zombie ? '#000000' : '#2a1a10';
        g.fillRect(4, 6, zombie ? 3 : 2, zombie ? 3 : 2);
        g.fillRect(w - 4 - (zombie ? 3 : 2), 6, zombie ? 3 : 2, zombie ? 3 : 2);
        g.fillStyle = zombie ? '#3a0a0a' : '#6a3a2a';
        g.fillRect(5, 11, w - 10, zombie ? 3 : 1);
        if (zombie) {
          g.fillStyle = '#c8c0a0';
          g.fillRect(6, 11, 1, 1);
          g.fillRect(8, 12, 1, 1);
          g.fillStyle = blood;
          g.fillRect(6, 14, 4, 2);
        } else {
          g.fillStyle = '#4a5030';
          g.fillRect(0, 0, w, 4);
        }
        void h;
      }),
    );
    const cloth = psxMaterial(grime(zombie ? pick(rnd, [0x5a5a6a, 0x6a5040, 0x4a5a4a]) : 0x4a5232, rnd, (g, w, h) => {
      g.fillStyle = zombie ? blood : '#353a22';
      for (let i = 0; i < 5; i++) g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 2 + Math.floor(rnd() * 3), 2);
    }));
    const pants = psxMaterial(grime(zombie ? 0x3a3e4a : 0x3e4428, rnd));
    const dark = psxMaterial(grime(0x1e1e1e, rnd));
    const put = (j: JointName, g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh => f.put(j, new THREE.Mesh(g, m), x, y, z);
    const cyl = (r0: number, r1: number, len: number, seg = 5): THREE.CylinderGeometry => new THREE.CylinderGeometry(r0, r1, len, seg);
    // the face is painted on the front of a six-sided head
    const head = new THREE.CylinderGeometry(D.head * 0.42, D.head * 0.36, D.head, 6, 1).rotateY(Math.PI / 6);
    put('head', stand(head, D.head), [skin, skin, skin], 0, 0);
    put('head', new THREE.PlaneGeometry(D.head * 0.66, D.head * 0.8).rotateY(Math.PI), face, 0, D.head * 0.5, -D.head * 0.37);
    if (!zombie) put('head', stand(cyl(D.head * 0.5, D.head * 0.48, 0.12, 7), 0.12), cloth, 0, D.head * 0.72);
    else put('head', new THREE.BoxGeometry(0.1, 0.06, 0.06), dark, 0.02, D.head * 0.12, -0.08);
    put('torso', stand(cyl(0.2, 0.15, D.torso, 5).scale(1, 1, 0.7), D.torso), cloth);
    put('pelvis', cyl(0.15, 0.13, 0.18, 5).scale(1, 1, 0.7), pants, 0, -0.03);
    for (const s of ['L', 'R'] as const) {
      put(`arm${s}`, hang(cyl(0.065, 0.055, D.upper + 0.03, 4), D.upper + 0.03), zombie ? skin : cloth, 0, 0.02);
      put(`fore${s}`, hang(cyl(0.055, 0.045, D.fore, 4), D.fore), skin);
      put(`fore${s}`, new THREE.BoxGeometry(0.07, 0.1, 0.05), skin, 0, -D.fore - 0.04);
      put(`leg${s}`, hang(cyl(0.09, 0.07, D.thigh + 0.04, 4), D.thigh + 0.04), pants, 0, 0.02);
      put(`shin${s}`, hang(cyl(0.07, 0.055, D.shin, 4), D.shin), zombie && s === 'L' ? skin : pants);
      put(`shin${s}`, new THREE.BoxGeometry(0.12, 0.08, 0.24).translate(0, 0, -0.05), dark, 0, -D.shin - 0.02);
    }
    if (!zombie) {
      put('torso', stand(new THREE.BoxGeometry(0.38, D.torso * 0.5, 0.28), D.torso * 0.5), pants, 0, D.torso * 0.3);
      rifle(f, (p) => (p === 'accent' ? cloth : dark));
      muzzleFlash(f, new THREE.MeshBasicMaterial({ color: 0xffc040 }), 1.2);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// the catalogue
// ---------------------------------------------------------------------------------------------

export const STYLES: Style[] = [comic, voxel, vinyl, hologram, paper, psx];

export interface StyleSample {
  id: string;
  name: string;
  tagline: string;
  lore: string;
  form: Form;
  style: Style;
  height: number;
  build(seed: number): StyleFigure;
}

export const STYLE_SAMPLES: StyleSample[] = STYLES.flatMap((style) =>
  (['squad', 'zombie'] as const).map((form) => ({
    id: `style-${style.id}-${form}`,
    name: `${style.name}: ${form === 'squad' ? 'soldier' : 'infected'}`,
    tagline: style.tagline,
    lore: style.lore,
    form,
    style,
    height: ((d) => d.foot + d.shin + d.thigh + d.torso + d.neck + d.head)(style.dims(form)),
    build: (seed: number) => new StyleFigure(style, form, seed),
  })),
);
