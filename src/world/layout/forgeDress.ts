/**
 * THE FORGE, dressed as a working foundry: flowing molten metal (a shader, not a flat glow), smokestacks, pipe bridges,
 * the Crucible's catwalk and its hanging ladle, cooling ingots, slag heaps and wet patches on the roads that mirror the
 * firelight. Everything static is baked by the level builder (a handful of draw calls for the whole map); what breathes
 * (smoke, steam, embers, sparks) is handed back as ambient emitters for the particle system, which already scales them
 * to the quality tier and skips the far ones.
 *
 * Visual only, except for a few colliders that match what stands on the ground (the stacks, the bridge posts, the ingots).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EmitterKind } from '../../fx/fxTypes';
import { addBox } from '../structures';
import type { Ctx } from './util';

export interface ForgeEmitter {
  kind: EmitterKind;
  x: number;
  y: number;
  z: number;
  rate?: number;
  radius?: number;
  height?: number;
}

/** The Crucible's ladle: what the trap (`forge/ladle.ts`) tips, where its iron lands, and the lever that tips it. */
export interface LadleHandle {
  /** The bucket, pivoting on its trunnions (rotation.x tips it south). */
  bucket: THREE.Object3D;
  /** The iron spilled on the floor (scaled up from nothing as it floods), and its glow uniform. */
  spill: THREE.Mesh;
  spillGlow: THREE.IUniform<number>;
  /** The falling stream (hidden until it pours). */
  stream: THREE.Mesh;
  /** The lever's arm (rotation.x throws it). */
  lever: THREE.Object3D;
  /** Where the iron lands and how far it floods. */
  x: number;
  z: number;
  radius: number;
  /** The bucket's lip (where the stream starts) and where you stand to throw the lever. */
  lipY: number;
  leverX: number;
  leverZ: number;
}

export interface ForgeDressing {
  emitters: ForgeEmitter[];
  ladle: LadleHandle;
}

const moltenTime: THREE.IUniform<number> = { value: 0 };

/**
 * Molten metal that moves: bright veins flowing between plates of dark crust that drift, crack and close, drawn from the
 * surface's world position (so every pool and channel is one continuous melt). `glow` scales how hot it burns (the
 * ladle's spill cools through it). One shared clock.
 */
export function createMolten(glow: THREE.IUniform<number> = { value: 1 }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x1a0803, emissive: 0xff4a08, emissiveIntensity: 1, roughness: 0.5, metalness: 0.1 });
  m.userData.noPalette = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMoltenTime = moltenTime;
    shader.uniforms.uMoltenGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMoltenPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoltenPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vMoltenPos;
        uniform float uMoltenTime;
        uniform float uMoltenGlow;
        float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), f.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float mFbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 3; i++) { v += a * mNoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
          return v;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        vec2 mp = vMoltenPos.xz * 0.62 + vMoltenPos.y * 0.9;
        vec2 mflow = vec2(uMoltenTime * 0.05, uMoltenTime * 0.028);
        float m1 = mFbm(mp + mflow);
        float m2 = mFbm(mp * 2.1 - mflow * 1.6 + m1 * 1.7);
        // 1 = bright melt, 0 = dark crust plate
        float melt = 1.0 - smoothstep(0.3, 0.52, m2);
        float seam = 1.0 - smoothstep(0.0, 0.05, abs(m2 - 0.62));
        float heat = clamp(melt + seam * 0.55, 0.0, 1.0);
        float breathe = 0.86 + 0.14 * sin(uMoltenTime * 1.3 + m1 * 9.0);
        vec3 hot = mix(vec3(1.0, 0.16, 0.01), vec3(1.0, 0.72, 0.2), smoothstep(0.35, 1.0, heat * (0.55 + m1)));
        totalEmissiveRadiance = hot * (0.03 + heat * heat * 1.5) * breathe * uMoltenGlow;
        diffuseColor.rgb = mix(vec3(0.03, 0.022, 0.02), vec3(0.2, 0.05, 0.01), heat * uMoltenGlow);
        roughnessFactor = mix(0.92, 0.3, heat * uMoltenGlow);
        `,
      );
  };
  m.customProgramCacheKey = () => 'forge-molten';
  return m;
}

/** The shared melt for the map's pools and channels (its clock ticks with the level). */
export function moltenMaterial(c: Ctx): THREE.MeshStandardMaterial {
  c.b.tick((dt) => {
    moltenTime.value += dt;
  });
  return createMolten();
}

/** A blotchy mask: the outline of a puddle. In the colour channels: three reads an alphaMap's green, not its alpha. */
function puddleMask(seed: number): THREE.CanvasTexture | THREE.DataTexture {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  let s = seed >>> 0;
  const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lobes: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) lobes.push([0.5 + (rnd() - 0.5) * 0.5, 0.5 + (rnd() - 0.5) * 0.5, 0.14 + rnd() * 0.16]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [lx, ly, lr] of lobes) {
        const d = Math.hypot(x / S - lx, y / S - ly) / lr;
        v = Math.max(v, 1 - d);
      }
      const a = Math.max(0, Math.min(1, v * 3.2));
      const o = (y * S + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.round(a * 255);
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * The two finishes the dressing's plain colours use, and the shadow flags they are baked with. The builder merges every
 * plain colour at one finish and one pair of flags into a single batch per chunk, and both of these are already in every
 * chunk of the Forge (its props use them): baked this way the dressing joins those batches instead of adding its own.
 * Change either and each chunk it stands in gains a draw call.
 */
const MATTE = { roughness: 0.85, metalness: 0 } as const;
const METAL = { roughness: 0.5, metalness: 0.7 } as const;
const MATTE_BAKE = { cast: true, receive: true } as const;
const METAL_BAKE = { cast: false, receive: true } as const;

export function dressForge(c: Ctx, crucible: { x: number; z: number }): ForgeDressing {
  const { b } = c;
  const emitters: ForgeEmitter[] = [];
  const steel = b.mats.get('steelDark');

  // ---- materials: draw calls, not looks, decide how many the dressing has (see MATTE / METAL) ----
  const matte = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, ...MATTE });
  const metal = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, ...METAL });
  const stackBrick = matte(0x4a2a20);
  const stackBand = matte(0x5a1810);
  const soot = matte(0x100c0a);
  const slag = matte(0x16120f);
  const plank = matte(0x3a2c1e);
  const pipeHot = metal(0x4a3026);
  const pipeCold = metal(0x3c444a);
  const ingotCold = metal(0x3a3c40);
  const ingotWarm = metal(0x4a2a22);
  const grate = metal(0x24262a);
  // whatever still glows wears the Forge's own amber (the furnace mouths, the pillar): one more batch nowhere
  const hot = b.mats.get('emAmber');
  const HOT_BAKE = { cast: false, receive: true } as const;

  // ---- smokestacks ----
  const stack = (x: number, z: number, base: number, h: number, r: number, collide: boolean, smoke: number): void => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r, h, 14, 1, true), stackBrick);
    body.position.set(x, base + h / 2, z);
    b.add(body, MATTE_BAKE);
    // warning bands and a sooted crown
    for (const [t, m] of [[0.72, stackBand], [0.86, stackBand], [0.97, soot]] as const) {
      const rr = r * (1 - 0.38 * t) + 0.03;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.985, rr, h * 0.05, 14, 1, true), m);
      band.position.set(x, base + h * t, z);
      b.add(band, MATTE_BAKE);
    }
    const top = base + h;
    // the glowing mouth, on the ones near enough to look into (the far ones are their glow alone)
    if (smoke > 0) {
      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.56, 0.3, 12), hot);
      mouth.position.set(x, top - 0.25, z);
      b.add(mouth, HOT_BAKE);
    }
    if (collide) {
      addBox(b, 'concreteDark', x, base + 0.5, z, r * 2.5, 1, r * 2.5);
      b.collideBox(x, z, r * 2.3, r * 2.3, Math.min(h, 12), { mapKind: 'building', tag: 'smokestack' });
    }
    b.glow({ x, y: top + 0.6, z, color: 0xff5a1a, size: r * 2.6, intensity: 1.1, mode: 'pulse', period: 3.5 + (x % 3), phase: z });
    b.glow({ x: x + r * 0.7, y: base + h * 0.9, z, color: 0xff2014, size: 1.1, intensity: 2.4, mode: 'blink', period: 2.2, duty: 0.3, phase: x * 0.37 });
    if (smoke > 0) emitters.push({ kind: 'smoke', x, y: top + 0.4, z, rate: smoke, radius: r * 0.45, height: 11 });
  };
  // the Crucible's pair, behind its north wall (clear of its north door)
  stack(crucible.x - 7, crucible.z - 15, 0, 30, 1.7, true, 4.5);
  stack(crucible.x + 7, crucible.z - 15, 0, 34, 1.7, true, 4.5);
  // Vulcan HQ: the Great Furnace's flue, up through the roof
  stack(44.5, 17, 6.2, 15, 1.1, false, 3.5);
  // the market's workshop and the pad office: small flues on their roofs
  stack(-49.5, 15.5, 4.8, 6, 0.55, false, 2);
  // more of them beyond the wall, where nobody walks (no smoke: too far to matter, their glow carries). East and south
  // only: there they fall in chunks the map already draws; to the west and north each would start a chunk of its own
  stack(106, -58, 0, 44, 2.4, false, 0);
  stack(107, 24, 0, 42, 2.3, false, 0);
  stack(-44, 80, 0, 40, 2.2, false, 0);
  stack(38, 80.4, 0, 46, 2.4, false, 0);

  // ---- pipe bridges over Smelter Row, and the run along the Crucible's front ----
  const wallZ = crucible.z + 9; // the Crucible's south wall
  const pipeAlongX = (x0: number, x1: number, y: number, z: number, r: number, m: THREE.Material): void => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), 8, 1, true), m);
    g.rotation.z = Math.PI / 2;
    g.position.set((x0 + x1) / 2, y, z);
    b.add(g, METAL_BAKE);
  };
  const pipeAlongZ = (z0: number, z1: number, y: number, x: number, r: number, m: THREE.Material): void => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), 8, 1, true), m);
    g.rotation.x = Math.PI / 2;
    g.position.set(x, y, (z0 + z1) / 2);
    b.add(g, METAL_BAKE);
  };
  pipeAlongX(crucible.x - 14.6, crucible.x + 14.6, 6.6, wallZ + 0.42, 0.24, pipeHot);
  pipeAlongX(crucible.x - 14.6, crucible.x + 14.6, 6.05, wallZ + 0.36, 0.14, pipeCold);
  for (let x = crucible.x - 13; x <= crucible.x + 13; x += 6.5) addBox(b, steel, x, 6.3, wallZ + 0.3, 0.12, 1, 0.5, 0, { cast: false });
  const bridge = (x: number): void => {
    const z0 = wallZ + 0.9;
    const z1 = wallZ + 7.9; // across the row (5 m of road and its kerbs)
    const y = 5.6;
    for (const z of [z0, z1]) {
      addBox(b, steel, x - 0.7, y / 2, z, 0.22, y, 0.22);
      addBox(b, steel, x + 0.7, y / 2, z, 0.22, y, 0.22);
      addBox(b, steel, x, y * 0.5, z, 1.5, 0.1, 0.1, 0, { cast: false });
      addBox(b, steel, x, y - 0.1, z, 1.62, 0.18, 0.3);
      // a collider for each leg: you walk, and shoot, between them
      b.collideBox(x - 0.7, z, 0.3, 0.3, y, { mapKind: 'prop', tag: 'pipe-bridge' });
      b.collideBox(x + 0.7, z, 0.3, 0.3, y, { mapKind: 'prop', tag: 'pipe-bridge' });
    }
    // the truss and what it carries
    addBox(b, steel, x - 0.7, y, (z0 + z1) / 2, 0.16, 0.16, z1 - z0);
    addBox(b, steel, x + 0.7, y, (z0 + z1) / 2, 0.16, 0.16, z1 - z0);
    for (let z = z0 + 0.9; z < z1; z += 1.2) addBox(b, steel, x, y, z, 1.4, 0.07, 0.07, 0, { cast: false });
    pipeAlongZ(z0 - 0.5, z1 + 0.4, y + 0.38, x - 0.36, 0.24, pipeHot);
    pipeAlongZ(z0 - 0.5, z1 + 0.4, y + 0.3, x + 0.18, 0.15, pipeCold);
    pipeAlongZ(z0 - 0.5, z1 + 0.4, y + 0.28, x + 0.52, 0.1, pipeCold);
    // down from the bridge on the far side
    const down = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, y + 0.4, 8, 1, true), pipeHot);
    down.position.set(x - 0.36, (y + 0.4) / 2, z1 + 0.4);
    b.add(down, METAL_BAKE);
    b.collideBox(x - 0.36, z1 + 0.4, 0.48, 0.48, y, { mapKind: 'prop', tag: 'pipe-bridge' });
    // a joint that leaks
    emitters.push({ kind: 'steam', x: x - 0.36, y: y + 0.7, z: (z0 + z1) / 2 + 0.6, rate: 5, radius: 0.12, height: 2.4 });
  };
  bridge(crucible.x - 18.5);
  bridge(crucible.x);

  // ---- the Crucible: a catwalk along its north wall, chains, the pools' breath ----
  const cwZ = crucible.z - 7.9;
  addBox(b, grate, crucible.x, 4.4, cwZ, 28, 0.08, 1.5, 0, METAL_BAKE);
  for (let x = crucible.x - 13.5; x <= crucible.x + 13.5; x += 4.5) {
    addBox(b, steel, x, 4.95, cwZ + 0.72, 0.06, 1.05, 0.06, 0, { cast: false });
    // its posts stand against the north wall, but not in the doorway in the middle of it (3 m wide)
    if (Math.abs(x - crucible.x) > 1.6) addBox(b, steel, x, 2.2, cwZ - 0.6, 0.14, 4.4, 0.14, 0, { cast: false });
    addBox(b, steel, x, 4.1, cwZ, 0.1, 0.1, 1.5, 0, { cast: false });
  }
  addBox(b, steel, crucible.x, 5.45, cwZ + 0.72, 28, 0.06, 0.06, 0, { cast: false });
  addBox(b, steel, crucible.x, 4.95, cwZ + 0.72, 28, 0.04, 0.04, 0, { cast: false });
  // what rises off the melt: embers over each pool and channel, sparks where the crust breaks
  const pools: [number, number, number][] = [
    [30, -33, 2.4], [42, -33, 2.4], [13.5, -40, 1.2], [13.5, -28, 1.2], [55, -28.5, 1.6],
  ];
  for (const [x, z, r] of pools) emitters.push({ kind: 'embers', x, y: 0.3, z, rate: 5, radius: r, height: 5 });
  emitters.push({ kind: 'sparks', x: 30, y: 0.25, z: -33, rate: 0.3 }, { kind: 'sparks', x: 42, y: 0.25, z: -33, rate: 0.3 });
  // the phoenix in the crossroads burns too
  emitters.push({ kind: 'embers', x: 0, y: 0.2, z: 0, rate: 5, radius: 5, height: 6 });
  // a broken main in the market, a vent by the pad
  emitters.push({ kind: 'steam', x: -8.5, y: 0.15, z: 30.5, rate: 6, radius: 0.2, height: 3 });
  emitters.push({ kind: 'steam', x: -20.5, y: 0.15, z: -6.4, rate: 6, radius: 0.2, height: 3 });
  for (const [x, z] of [[-8.5, 30.5], [-20.5, -6.4]] as const) {
    addBox(b, grate, x, 0.04, z, 0.9, 0.05, 0.9, 0, METAL_BAKE);
  }

  // ---- ingots: stacked to cool, the newest still glowing ----
  const ingots = (x: number, z: number, rot: number, heat: 0 | 1 | 2): void => {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let layer = 0; layer < 3; layer++) {
      const n = 4 - layer;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.46;
        const m = layer === 2 && heat === 2 ? hot : layer >= 1 && heat >= 1 ? ingotWarm : ingotCold;
        addBox(b, m, x + cos * off, 0.2 + layer * 0.26, z - sin * off, 0.4, 0.24, 1.3, rot, m === hot ? HOT_BAKE : METAL_BAKE);
      }
    }
    addBox(b, plank, x, 0.05, z, 2, 0.1, 1.5, rot, MATTE_BAKE);
    b.collideBox(x, z, 2, 1.5, 0.95, { mapKind: 'prop', tag: 'ingots', rot });
    if (heat === 2) emitters.push({ kind: 'embers', x, y: 0.9, z, rate: 1.5, radius: 0.5, height: 2 });
  };
  ingots(49, -25, 0.1, 2);
  ingots(24.5, -36, 1.5, 1);
  ingots(18.4, -23.5, 0.3, 2);
  ingots(53, 39, 0.2, 1);
  ingots(-37, 17, 1.4, 0);
  ingots(26, 12, -0.2, 1);

  // ---- slag heaps ----
  const heap = (x: number, z: number, r: number, glowing: boolean): void => {
    // an icosahedron keeps a copy of each corner per face: push every copy of a corner the same way (by where it
    // is, not by its index), or the faces come apart. Its own per-face normals then give the broken, faceted look.
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i);
      const py = p.getY(i);
      const pz = p.getZ(i);
      const k = 0.78 + 0.44 * (Math.abs(Math.sin(Math.round(px * 50) * 12.9898 + Math.round(py * 50) * 78.233 + Math.round(pz * 50) * 37.719 + x * 7.1 + z * 3.3) * 43758.5453) % 1);
      p.setXYZ(i, px * k, Math.max(0, py) * k * 0.62, pz * k);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, slag);
    m.position.set(x, 0, z);
    m.scale.setScalar(r);
    b.add(m, MATTE_BAKE);
    if (glowing) {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), hot);
      core.position.set(x + r * 0.3, r * 0.2, z + r * 0.2);
      core.scale.set(r * 0.45, r * 0.3, r * 0.45);
      b.add(core, HOT_BAKE);
      emitters.push({ kind: 'smoke', x, y: r * 0.5, z, rate: 1.5, radius: r * 0.4, height: 5 });
    }
    b.collideBox(x, z, r * 1.5, r * 1.5, r * 0.6, { mapKind: 'prop', tag: 'slag' });
  };
  heap(16.5, -47, 1.6, true);
  heap(57.5, -34, 1.5, true);

  // ---- wet patches on the roads: dark, mirror-smooth, so the lamps and the fires lie in them ----
  const wet = new THREE.MeshStandardMaterial({
    color: 0x07080a, roughness: 0.06, metalness: 0.85, transparent: true, opacity: 0.82, alphaMap: puddleMask(1201), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, envMapIntensity: 1.6,
  });
  const puddle = (x: number, z: number, w: number, d: number, rot: number): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), wet);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.026, z);
    m.receiveShadow = true;
    m.userData.worldUV = false;
    b.add(m, { cast: false });
  };
  const spots: [number, number, number, number, number][] = [
    [-44, 1.5, 7, 4, 0.2], [-26, -2, 6, 3.4, 1.1], [-12, 2.4, 5, 3, 2.3], [14, -1.6, 7, 4, 0.6], [30, 2, 6, 3.6, 1.9], [48, -1, 7, 4.4, 2.8],
    [-1.5, -22, 4, 6, 0.4], [2, -40, 3.6, 5, 1.3], [-2, 18, 4, 6.4, 2.2], [1.6, 36, 3.6, 5.6, 0.9], [2, 58, 4, 5, 1.7],
    [-30, 25, 6, 3, 0.3], [-48, 24.4, 5, 3, 2.6], [22, -15.6, 6, 2.8, 0.5], [44, -15.2, 6.4, 3, 2.1], [-72, -1.4, 6, 4, 0.8],
  ];
  for (const [x, z, w, d, rot] of spots) puddle(x, z, w, d, rot);

  // ---- the ladle ----
  const ladle = buildLadle(c, crucible, emitters);

  // firelight for the pool to pick from
  b.light({ x: crucible.x - 7, y: 3, z: crucible.z - 13.4, color: 0xff5a1a, intensity: 60, distance: 12 });
  b.light({ x: crucible.x + 7, y: 3, z: crucible.z - 13.4, color: 0xff5a1a, intensity: 60, distance: 12 });
  return { emitters, ladle };
}

/**
 * The Crucible's ladle: a bucket of iron hanging from the gantry on two chains, between the pools. The lever on the
 * south wall tips it (`forge/ladle.ts`).
 */
function buildLadle(c: Ctx, crucible: { x: number; z: number }, emitters: ForgeEmitter[]): LadleHandle {
  const { b } = c;
  const x = crucible.x;
  const z = crucible.z - 4; // under the gantry
  const y = 4.5; // the trunnions
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, ...METAL });
  const scorched = new THREE.MeshStandardMaterial({ color: 0x15100d, ...METAL });
  // chains and yoke (static)
  for (const s of [-1, 1]) {
    addBox(b, iron, x + s * 1.25, (y + 7) / 2 + 0.2, z, 0.07, 7 - y, 0.07, 0, METAL_BAKE);
    addBox(b, iron, x + s * 1.25, y, z, 0.16, 0.5, 0.3, 0, METAL_BAKE);
  }
  addBox(b, iron, x, 6.9, z, 2.9, 0.22, 0.3, 0, METAL_BAKE);
  // the bucket (dynamic: it tips). Two draw calls: the iron (shell, hoops, floor, spout and trunnions, one merged
  // mesh) and the melt in it.
  const bucket = new THREE.Group();
  bucket.position.set(x, y, z);
  const part = (g: THREE.BufferGeometry, px: number, py: number, pz: number, rx = 0, rz = 0): THREE.BufferGeometry => {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1)));
    return g;
  };
  const shell = new THREE.Mesh(
    mergeGeometries([
      part(new THREE.CylinderGeometry(1.1, 0.85, 1.9, 16, 1, true), 0, -0.35, 0),
      part(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 16), 0, -1.3, 0),
      part(new THREE.TorusGeometry(1.1, 0.07, 6, 18), 0, 0.6, 0, Math.PI / 2),
      part(new THREE.TorusGeometry(1.02, 0.05, 6, 18), 0, -0.3, 0, Math.PI / 2),
      part(new THREE.BoxGeometry(0.5, 0.1, 0.5), 0, 0.58, 1.2, 0.25),
      part(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8), 0, 0, 0, 0, Math.PI / 2),
    ]),
    // seen from inside too (the open top, when it tips)
    new THREE.MeshStandardMaterial({ color: 0x211c19, ...METAL, side: THREE.DoubleSide }),
  );
  shell.castShadow = true;
  const surface = new THREE.Mesh(new THREE.CircleGeometry(1.04, 16), b.mats.get('emAmber'));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.38;
  bucket.add(shell, surface);
  b.addDynamic(bucket);

  // what it pours, and what lies on the floor after (both hidden until the lever is thrown)
  const radius = 4.4;
  const lx = x;
  const lz = z + 3.2;
  const spillGlow: THREE.IUniform<number> = { value: 0 };
  const spillMat = createMolten(spillGlow);
  spillMat.customProgramCacheKey = () => 'forge-molten'; // the same program as the pools
  spillMat.polygonOffset = true;
  spillMat.polygonOffsetFactor = -2;
  spillMat.polygonOffsetUnits = -2;
  const spill = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), spillMat);
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(lx, 0.045, lz);
  spill.scale.setScalar(0.001);
  spill.visible = false;
  spill.receiveShadow = false;
  b.addDynamic(spill);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, y, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.14).multiplyScalar(1.7), fog: false }));
  stream.position.set(lx, y / 2, z + 1.6);
  stream.visible = false;
  b.addDynamic(stream);

  // the lever, on the inside of the south wall between the two great doors
  const leverX = x;
  const wallIn = crucible.z + 9 - 0.42;
  addBox(b, scorched, leverX, 1.15, wallIn, 0.5, 0.8, 0.14, 0, METAL_BAKE);
  addBox(b, b.mats.get('emAmber'), leverX, 1.7, wallIn - 0.02, 0.5, 0.12, 0.1, 0, { cast: false });
  const lever = new THREE.Mesh(
    mergeGeometries([part(new THREE.BoxGeometry(0.06, 0.6, 0.06), 0, 0.3, 0), part(new THREE.SphereGeometry(0.09, 8, 6), 0, 0.62, 0)]),
    new THREE.MeshStandardMaterial({ color: 0xb0281a, roughness: 0.5 }),
  );
  lever.position.set(leverX, 1.0, wallIn - 0.1);
  lever.rotation.x = -0.6;
  b.addDynamic(lever);

  b.light({ x, y: y + 1.4, z, color: 0xff6a1a, intensity: 80, distance: 13, weight: 1.4 });
  b.glow({ x, y: y + 0.9, z, color: 0xff6a1a, size: 3.2, intensity: 1.2, mode: 'pulse', period: 2.7 });
  emitters.push({ kind: 'embers', x, y: y + 0.6, z, rate: 3, radius: 0.7, height: 3 });
  return { bucket, spill, spillGlow, stream, lever, x: lx, z: lz, radius, lipY: y, leverX, leverZ: wallIn - 0.9 };
}
