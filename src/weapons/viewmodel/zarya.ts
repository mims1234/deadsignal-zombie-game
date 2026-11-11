/**
 * ZARYA's seven guns, in your hands (the seventh, the Raketa vacuum cannon, comes out of Ded Moroz's sack). Each stands on one of the stock rigs for its HANDS and its MOTION only (the pistol's
 * for the Signalka and the Zenit, the rifle's for the crossbow and the nail gun, the launcher's for the Salyut and the
 * Ottepel): the stock gun itself is put away and the thing is built here from its own parts, round the places those
 * hands already hold. What moves on each (a barrel breaking open, a string drawn, a needle on a gauge) is driven from
 * the same `ViewmodelPose` as everything else.
 *
 * Gun space is the stock rig's: origin = its sight point, +X right, +Y up, -Z forward (`F(f)` = a distance forward).
 * No textures of their own: the stock rig's materials where they fit, plain ones for wood, copper, paper and glass.
 */
import * as THREE from 'three';
import type { ZaryaGunId } from '../../types';
import type { ViewmodelPose, ViewmodelRig } from '../viewmodelTypes';
import type { GloveHand } from './hand';
import { PartBuilder } from './kit';
import type { RigMaterials, SharedTextures } from './materials';
import { createPistol } from './pistol';
import { createRifle } from './rifle';
import type { BaseRig } from './rigBase';
import { createRpg } from './rpg';
import { clamp01, seg, smooth } from './util';

const F = (f: number): number => -f;
type V3 = [number, number, number];

// where the stock rigs' hands close (their own grips' profiles, [f, y]): each of ZARYA's is built round these
const PISTOL_GRIP: [number, number][] = [[0.04, -0.043], [0.036, -0.068], [0.011, -0.136], [-0.052, -0.142], [-0.035, -0.07], [-0.031, -0.046], [-0.04, -0.041], [-0.036, -0.035], [-0.012, -0.036]];
const RB = -0.088; // the rifle's bore
const RIFLE_GRIP: [number, number][] = ([[-0.046, -0.055], [-0.056, -0.1], [-0.078, -0.15], [-0.073, -0.172], [-0.042, -0.176], [-0.027, -0.15], [-0.022, -0.1], [-0.02, -0.055]] as [number, number][]).map(([f, y]) => [f, RB + y]);
const RIFLE_FORE: [number, number][] = ([[0.195, -0.026], [0.252, -0.026], [0.247, -0.072], [0.24, -0.124], [0.224, -0.143], [0.205, -0.137], [0.197, -0.092]] as [number, number][]).map(([f, y]) => [f, RB + y]);
const TX = 0.088; // the launcher's tube axis
const TY = -0.074;
const RPG_GRIP: [number, number][] = [[0.1, TY - 0.03], [0.09, TY - 0.06], [0.07, TY - 0.13], [0.03, TY - 0.13], [0.045, TY - 0.06], [0.05, TY - 0.03]];
const RPG_FORE: [number, number][] = [[0.32, TY - 0.03], [0.31, TY - 0.12], [0.27, TY - 0.12], [0.28, TY - 0.03]];

const mat = (color: number, roughness = 0.6, metalness = 0, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity, envMapIntensity: 1.2 });

const _y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);

/** A round rod from `a` to `b` (a strut, a fuse, a bracket). */
function rod(pb: PartBuilder, key: string, a: V3, b: V3, r: number, sides = 6): void {
  _a.set(...a);
  _b.set(...b);
  const len = _a.distanceTo(_b);
  _q.setFromUnitVectors(_y, _b.clone().sub(_a).normalize());
  pb.add(key, new THREE.CylinderGeometry(r, r, len, sides, 1, false), _m.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, _one));
}

interface Look {
  /** Keep the stock rig's muzzle flash (a crossbow, a camera and a steam lance have none). */
  flash: boolean;
  /** The whole rig (hands and all) moved from where the stock gun is held: at the hip, and aimed. */
  hip?: V3;
  ads?: V3;
  /**
   * What moves on it: called every frame after the hands are placed. `fired` is 1 at a shot and falls away; `kick` is
   * how hard that last shot was (`onFire`'s strength: the Raketa sucking is a light one, its blast a heavy one).
   */
  animate?(pose: ViewmodelPose, fired: number, kick: number): void;
}

class ZaryaRig implements ViewmodelRig {
  readonly root: THREE.Group;
  readonly muzzle: THREE.Object3D;
  readonly ejectPort: THREE.Object3D;
  private fired = 0;
  private kick = 1;

  constructor(
    readonly id: ZaryaGunId,
    private readonly inner: BaseRig,
    /** The stock gun's own parts: never drawn. */
    private readonly stock: THREE.Object3D[],
    private readonly own: { dispose(): void }[],
    private readonly look: Look,
  ) {
    this.root = inner.root;
    this.muzzle = inner.muzzle;
    this.ejectPort = inner.ejectPort;
  }

  update(pose: ViewmodelPose, dt: number): void {
    this.inner.update(pose, dt);
    if (!this.root.visible) return;
    // the stock rig shows and hides its own parts as it moves (a magazine, a rocket): they stay put away
    for (const o of this.stock) o.visible = false;
    if (!this.look.flash) this.muzzle.visible = false;
    this.fired = Math.max(0, this.fired - dt * 7);
    const a = clamp01(pose.ads);
    const h = this.look.hip;
    const s = this.look.ads;
    this.root.position.set((h?.[0] ?? 0) * (1 - a) + (s?.[0] ?? 0) * a, (h?.[1] ?? 0) * (1 - a) + (s?.[1] ?? 0) * a, (h?.[2] ?? 0) * (1 - a) + (s?.[2] ?? 0) * a);
    this.look.animate?.(pose, this.fired, this.kick);
    this.root.updateMatrixWorld(true);
  }

  onFire(tier: number, strength?: number): void {
    this.inner.onFire(tier, strength);
    this.fired = 1;
    this.kick = strength ?? 1;
  }

  setTier(tier: number): void {
    this.inner.setTier(tier);
  }

  reset(): void {
    this.inner.reset();
    this.fired = 0;
    this.kick = 1;
  }

  dispose(): void {
    this.inner.dispose();
    for (const o of this.own) o.dispose();
  }
}

/** Put the stock gun away and hand back what one of ZARYA's is built with: `part` adds a merged group of its own. */
function strip(inner: BaseRig, extra: Record<string, THREE.Material>) {
  const hands = inner as unknown as { rh: GloveHand; lh: GloveHand; mats: RigMaterials };
  const stock = [
    ...inner.gun.children.filter((c) => c !== inner.muzzle && c !== inner.ejectPort),
    ...inner.root.children.filter((c) => c !== inner.gun && c !== hands.rh.root && c !== hands.lh.root),
  ];
  for (const o of stock) o.visible = false;
  const own: { dispose(): void }[] = Object.values(extra);
  const mk = (k: string): THREE.Material => extra[k] ?? hands.mats.get(k);
  const part = (build: (b: PartBuilder) => void, parent: THREE.Object3D = inner.gun): THREE.Group => {
    const b = new PartBuilder();
    build(b);
    const g = b.build(mk);
    parent.add(g);
    own.push(b);
    return g;
  };
  return { stock, own, part, mk };
}

// -------------------------------------------------------------------------------------------------
// Signalka: a break-action flare pistol (a fat short barrel on a hinge, a bakelite grip, a signal band at the muzzle)
// -------------------------------------------------------------------------------------------------

export function createSignalka(tex: SharedTextures): ViewmodelRig {
  const inner = createPistol(tex);
  const k = strip(inner, { bakelite: mat(0x5c2e18, 0.5), band: mat(0xd8481c, 0.45, 0, 0xff3a10, 0.55), bore: mat(0x070707, 0.95), shell: mat(0xc23a1a, 0.5) });
  const BY = -0.025; // the bore
  k.part((b) => {
    b.side('bakelite', PISTOL_GRIP, 0.035, 0, 0.005, 0.9, 0);
    b.box('blued', 0.033, 0.006, 0.066, 0, -0.141, F(-0.02), 0.002, { rx: -0.31 });
    b.torus('steel', 0.009, 0.002, 0, -0.153, F(-0.024), { ry: Math.PI / 2 }, 8);
    // the frame: a standing breech behind the barrel, the hinge block under it
    b.box('blued', 0.034, 0.05, 0.03, 0, -0.03, F(-0.026), 0.004);
    b.box('blued', 0.03, 0.022, 0.1, 0, -0.052, F(0.03), 0.004);
    b.cyl('steel', 0.0065, 0.0065, 0.036, 0, -0.056, F(0.075), 'x', 10);
    // hammer spur, trigger and its guard
    b.box('steel', 0.009, 0.028, 0.011, 0, 0.0, F(-0.04), 0.002, { rx: -0.55 });
    b.box('steel', 0.006, 0.02, 0.005, 0, -0.064, F(0.044), 0.001, { rx: 0.25 });
    b.box('blued', 0.02, 0.004, 0.06, 0, -0.081, F(0.046), 0.0015);
    b.box('blued', 0.02, 0.022, 0.004, 0, -0.07, F(0.075), 0.0015);
    // the barrel latch on the left
    b.box('steel', 0.004, 0.008, 0.022, -0.018, -0.03, F(-0.01), 0.001);
  });
  // the barrel, on its hinge (it breaks open to load)
  const hinge: V3 = [0, -0.056, F(0.075)];
  const barrel = new THREE.Group();
  barrel.position.set(...hinge);
  inner.gun.add(barrel);
  const L = (f: number): number => F(f) - hinge[2];
  const by = BY - hinge[1];
  k.part((b) => {
    b.cyl('blued', 0.0205, 0.022, 0.176, 0, by, L(0.078), 'z', 18);
    b.cyl('band', 0.0225, 0.0225, 0.024, 0, by, L(0.142), 'z', 18);
    b.cyl('blued', 0.024, 0.024, 0.012, 0, by, L(0.162), 'z', 18);
    b.cyl('bore', 0.0168, 0.0168, 0.003, 0, by, L(0.1675), 'z', 14);
    b.cyl('brass', 0.0195, 0.0195, 0.005, 0, by, L(-0.011), 'z', 14);
    b.cyl('shell', 0.0165, 0.0165, 0.002, 0, by, L(-0.0145), 'z', 14);
    b.box('steel', 0.004, 0.008, 0.008, 0, by + 0.024, L(0.156), 0.001);
    b.box('blued', 0.014, 0.014, 0.07, 0, by - 0.024, L(0.045), 0.002);
  }, barrel);
  inner.muzzle.position.set(0, BY, F(0.175));
  return new ZaryaRig('signalka', inner, k.stock, k.own, {
    flash: true,
    animate(pose, fired) {
      // broken open while a flare goes in; a shot flips the muzzle up a touch more than the hands do
      const t = pose.reloadPhase === 'mag' ? clamp01(pose.reloadT) : 0;
      const open = smooth(seg(t, 0.08, 0.24)) * (1 - smooth(seg(t, 0.76, 0.9)));
      barrel.rotation.x = -0.95 * open + 0.05 * fired;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Zenit: a camera on a flash handle (the right hand holds the handle with its reflector, the camera rides beside it)
// -------------------------------------------------------------------------------------------------

export function createZenit(tex: SharedTextures): ViewmodelRig {
  const inner = createPistol(tex);
  const bulb = mat(0xfff6e0, 0.3, 0, 0xfff0d0, 0.25);
  const k = strip(inner, { leather: mat(0x2b2a2c, 0.8), chrome: mat(0xc9cdd2, 0.25, 0.9), dish: mat(0x9a9da2, 0.42, 0.7), glass: mat(0x0b1826, 0.05, 0.5), bulb });
  const CX = -0.092; // the camera's middle, left of the handle
  const CY = -0.012;
  const CF = 0.024;
  k.part((b) => {
    // the flash: a battery handle, and the reflector on top of it
    b.side('grip', PISTOL_GRIP, 0.031, 0, 0.0014, 0.6, 0);
    b.cyl('blued', 0.017, 0.017, 0.066, 0, -0.004, F(0.0), 'y', 14);
    b.cyl('chrome', 0.0185, 0.0185, 0.008, 0, 0.027, F(0.0), 'y', 14);
    b.lathe('dish', [[0.006, 0], [0.026, 0.008], [0.041, 0.024], [0.047, 0.04], [0.049, 0.041]], 0, 0.066, -0.012, 22);
    b.cyl('chrome', 0.006, 0.006, 0.012, 0, 0.066, F(-0.014), 'z', 10);
    b.sphere('bulb', 0.011, 0, 0.066, F(0.006), 1, 1, 1.2, 10);
    // the bracket that carries the camera
    b.box('blued', 0.12, 0.007, 0.03, -0.052, -0.05, F(CF), 0.002);
    b.cyl('chrome', 0.006, 0.006, 0.008, CX, -0.056, F(CF), 'y', 10);
    // the camera: leather body between chrome plates, the prism's hump, the knobs, the eyepiece, the lens
    b.box('leather', 0.128, 0.064, 0.044, CX, CY, F(CF), 0.006);
    b.box('chrome', 0.13, 0.014, 0.046, CX, CY + 0.037, F(CF), 0.004);
    b.box('chrome', 0.13, 0.007, 0.046, CX, CY - 0.034, F(CF), 0.003);
    b.box('chrome', 0.046, 0.024, 0.042, CX, CY + 0.054, F(CF), 0.008);
    b.cyl('chrome', 0.0125, 0.0125, 0.012, CX + 0.045, CY + 0.05, F(CF), 'y', 14);
    b.box('chrome', 0.004, 0.003, 0.026, CX + 0.045, CY + 0.058, F(CF + 0.012), 0.001, { ry: 0.5 });
    b.cyl('chrome', 0.011, 0.011, 0.01, CX - 0.047, CY + 0.049, F(CF), 'y', 14);
    b.cyl('chrome', 0.0045, 0.0045, 0.008, CX + 0.022, CY + 0.048, F(CF + 0.01), 'y', 10);
    // the back: the film door's frame and its latch
    b.box('rubber', 0.1, 0.05, 0.002, CX - 0.004, CY - 0.002, F(CF - 0.0225), 0.001);
    b.box('leather', 0.09, 0.04, 0.002, CX - 0.004, CY - 0.002, F(CF - 0.0235), 0.001);
    b.box('chrome', 0.006, 0.03, 0.003, CX + 0.058, CY - 0.002, F(CF - 0.023), 0.001);
    b.box('rubber', 0.022, 0.015, 0.006, CX, CY + 0.05, F(CF - 0.023), 0.002);
    b.box('glass', 0.012, 0.008, 0.002, CX, CY + 0.05, F(CF - 0.0265), 0.0005);
    b.cyl('blued', 0.031, 0.033, 0.026, CX, CY - 0.002, F(CF + 0.035), 'z', 20);
    b.cyl('rubber', 0.029, 0.031, 0.03, CX, CY - 0.002, F(CF + 0.063), 'z', 20);
    b.cyl('chrome', 0.0305, 0.0305, 0.005, CX, CY - 0.002, F(CF + 0.08), 'z', 20);
    b.cyl('glass', 0.024, 0.024, 0.002, CX, CY - 0.002, F(CF + 0.083), 'z', 18);
    // strap lugs
    b.torus('chrome', 0.005, 0.0012, CX - 0.066, CY + 0.026, F(CF), { ry: Math.PI / 2 }, 6);
    b.torus('chrome', 0.005, 0.0012, CX + 0.066, CY + 0.026, F(CF), { ry: Math.PI / 2 }, 6);
  });
  inner.muzzle.position.set(0, 0.066, F(0.03));
  return new ZaryaRig('zenit', inner, k.stock, k.own, {
    flash: false,
    hip: [0.055, -0.03, -0.06],
    ads: [0.046, -0.085, 0.04],
    animate(_pose, fired) {
      bulb.emissiveIntensity = 0.25 + 14 * fired * fired;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Arbalet: a hunting crossbow (a wooden tiller, a steel prod and its string, a stirrup, a bolt in the groove)
// -------------------------------------------------------------------------------------------------

export function createArbalet(tex: SharedTextures): ViewmodelRig {
  const inner = createRifle(tex);
  const cord = mat(0xd9d2b8, 0.8);
  const k = strip(inner, { wood: mat(0x6e4424, 0.62), shaft: mat(0x23262a, 0.5, 0.3), fletch: mat(0xb8281c, 0.7), cord });
  const NUT = 0.065; // where the string is held, cocked
  const TIP: V3 = [0.262, RB - 0.004, F(0.408)]; // a limb's tip (the right one)
  k.part((b) => {
    b.side('wood', RIFLE_GRIP, 0.032, 0, 0.004, 0.9, 0);
    b.side('wood', RIFLE_FORE, 0.031, 0, 0.004, 0.9, 0);
    // the tiller, butt to prod
    b.side('wood', [[-0.2, RB + 0.012], [-0.2, RB - 0.085], [-0.165, RB - 0.092], [-0.085, RB - 0.05], [0.0, RB - 0.055], [0.46, RB - 0.04], [0.47, RB - 0.01], [0.0, RB - 0.008], [-0.09, RB + 0.004]], 0.034, 0, 0.004, 0.9, 0);
    b.box('rubber', 0.036, 0.1, 0.012, 0, RB - 0.037, F(-0.204), 0.004);
    // the groove the bolt lies in, the lock, trigger and guard
    b.box('metal', 0.011, 0.004, 0.42, 0, RB - 0.006, F(0.255), 0.001);
    b.box('blued', 0.032, 0.024, 0.07, 0, RB - 0.004, F(0.04), 0.004);
    b.box('steel', 0.008, 0.012, 0.012, 0, RB + 0.012, F(NUT), 0.002);
    b.box('steel', 0.006, 0.026, 0.006, 0, RB - 0.072, F(0.006), 0.001, { rx: 0.3 });
    b.box('blued', 0.018, 0.004, 0.064, 0, RB - 0.09, F(0.014), 0.0015);
    b.box('blued', 0.018, 0.034, 0.004, 0, RB - 0.074, F(0.046), 0.0015);
    // the prod: two steel limbs swept back from the riser, and the stirrup ahead of it
    b.box('blued', 0.054, 0.034, 0.044, 0, RB - 0.008, F(0.462), 0.005);
    b.box('blued', 0.272, 0.017, 0.03, 0.131, RB - 0.004, F(0.445), 0.005, { ry: -0.28 });
    b.box('blued', 0.272, 0.017, 0.03, -0.131, RB - 0.004, F(0.445), 0.005, { ry: 0.28 });
    b.cyl('steel', 0.006, 0.006, 0.018, TIP[0], TIP[1], TIP[2], 'y', 8);
    b.cyl('steel', 0.006, 0.006, 0.018, -TIP[0], TIP[1], TIP[2], 'y', 8);
    b.torus('blued', 0.034, 0.0045, 0, RB - 0.008, F(0.515), undefined, 14);
    // a hunting scope on two mounts over the lock (an open tube: you look through it down the sights)
    b.add('blued', new THREE.CylinderGeometry(0.0135, 0.0135, 0.15, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, F(0.075)));
    b.add('blued', new THREE.CylinderGeometry(0.019, 0.0135, 0.04, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, F(0.17)));
    b.torus('blued', 0.0135, 0.0022, 0, 0, F(0.0), undefined, 16);
    b.torus('blued', 0.019, 0.0022, 0, 0, F(0.19), undefined, 16);
    b.cyl('steel', 0.005, 0.005, 0.012, 0, 0.018, F(0.085), 'y', 8);
    b.box('blued', 0.014, 0.066, 0.016, 0, -0.045, F(0.035), 0.002);
    b.box('blued', 0.014, 0.066, 0.016, 0, -0.045, F(0.12), 0.002);
    b.box('blued', 0.02, 0.008, 0.12, 0, -0.078, F(0.078), 0.002);
    // three more bolts in a clip on the right
    for (let i = 0; i < 3; i++) {
      b.cyl('shaft', 0.0032, 0.0032, 0.3, 0.024, RB - 0.016 - i * 0.012, F(0.22), 'z', 6);
      b.box('fletch', 0.002, 0.011, 0.034, 0.024, RB - 0.016 - i * 0.012, F(0.085), 0.0004);
    }
    b.box('blued', 0.012, 0.044, 0.014, 0.022, RB - 0.028, F(0.3), 0.002);
    b.box('blued', 0.012, 0.044, 0.014, 0.022, RB - 0.028, F(0.14), 0.002);
  });
  // the bolt in the groove (gone once it is shot, back when the next is laid in)
  const bolt = k.part((b) => {
    b.cyl('shaft', 0.0036, 0.0036, 0.42, 0, RB + 0.002, F(NUT + 0.225), 'z', 8);
    b.cyl('steel', 0.0004, 0.0062, 0.032, 0, RB + 0.002, F(NUT + 0.45), 'z', 8);
    b.box('fletch', 0.016, 0.0016, 0.042, 0, RB + 0.002, F(NUT + 0.04), 0.0004);
    b.box('fletch', 0.0016, 0.012, 0.042, 0, RB + 0.008, F(NUT + 0.04), 0.0004);
  });
  // the string: two runs from the limb tips to wherever it is held
  const strand = new THREE.BoxGeometry(1, 1, 1);
  const runs = [new THREE.Mesh(strand, cord), new THREE.Mesh(strand, cord)];
  for (const r of runs) inner.gun.add(r);
  k.own.push(strand);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const tip = new THREE.Vector3();
  const nock = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let drawn = 1;
  inner.muzzle.position.set(0, RB, F(0.5));
  return new ZaryaRig('arbalet', inner, k.stock, k.own, {
    flash: false,
    animate(pose) {
      const loading = pose.reloadPhase === 'mag';
      const t = loading ? clamp01(pose.reloadT) : 0;
      // spanned again early in the reload, the bolt laid in after; loose from the shot until then
      const want = loading ? smooth(seg(t, 0.16, 0.52)) : pose.ammo > 0 ? 1 : 0;
      drawn = want < drawn ? Math.max(want, drawn - 0.5) : want;
      bolt.visible = loading ? t >= 0.66 : pose.ammo > 0;
      nock.set(0, TIP[1] + 0.006, TIP[2] + (F(NUT) - TIP[2]) * drawn);
      for (let i = 0; i < 2; i++) {
        tip.set(i === 0 ? TIP[0] : -TIP[0], TIP[1], TIP[2]);
        const r = runs[i]!;
        dir.copy(nock).sub(tip);
        const len = dir.length();
        r.position.copy(tip).addScaledVector(dir, 0.5);
        r.quaternion.setFromUnitVectors(zAxis, dir.divideScalar(len));
        r.scale.set(0.0032, 0.0032, len);
      }
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Gvozdomyot: a framing nailer made into a gun (an orange housing, a driver nose, the nail strip, gas and an air tank)
// -------------------------------------------------------------------------------------------------

export function createGvozdomyot(tex: SharedTextures): ViewmodelRig {
  const inner = createRifle(tex);
  const k = strip(inner, { housing: mat(0xcf5f16, 0.48, 0.1), tank: mat(0x5d6a70, 0.4, 0.6), nails: mat(0xb9bcc0, 0.3, 0.9) });
  k.part((b) => {
    b.side('rubber', RIFLE_GRIP, 0.034, 0, 0.004, 0.9, 0);
    b.side('rubber', RIFLE_FORE, 0.031, 0, 0.004, 0.9, 0);
    // the housing, its vents and warning stripe
    b.box('housing', 0.058, 0.086, 0.27, 0, RB - 0.004, F(0.075), 0.014);
    for (let i = 0; i < 5; i++) b.box('blued', 0.06, 0.006, 0.012, 0, RB + 0.018, F(0.03 + i * 0.03), 0.001);
    b.box('yellow', 0.0595, 0.016, 0.1, 0, RB - 0.03, F(0.12), 0.001);
    // the nose: the driver's barrel in its guard rings, and the contact tip
    b.cyl('steel', 0.012, 0.016, 0.25, 0, RB, F(0.335), 'z', 12);
    for (const f of [0.26, 0.33, 0.4]) b.torus('blued', 0.022, 0.0034, 0, RB, F(f), undefined, 10);
    b.box('blued', 0.006, 0.006, 0.15, 0, RB + 0.022, F(0.33), 0.001);
    b.box('blued', 0.006, 0.006, 0.15, 0, RB - 0.022, F(0.33), 0.001);
    b.box('steel', 0.026, 0.04, 0.024, 0, RB - 0.004, F(0.468), 0.003);
    // trigger and guard
    b.box('steel', 0.006, 0.026, 0.006, 0, RB - 0.072, F(0.006), 0.001, { rx: 0.3 });
    b.box('blued', 0.018, 0.004, 0.064, 0, RB - 0.09, F(0.014), 0.0015);
    // the gas canister on the right, the air tank behind as a stock, the line between them
    b.cyl('red', 0.018, 0.018, 0.11, 0.044, RB - 0.012, F(0.06), 'z', 14);
    b.cyl('steel', 0.009, 0.009, 0.014, 0.044, RB - 0.012, F(0.122), 'z', 10);
    b.cyl('tank', 0.03, 0.03, 0.07, 0, RB - 0.012, F(-0.115), 'z', 18);
    b.sphere('tank', 0.03, 0, RB - 0.012, F(-0.15), 1, 1, 0.5, 14);
    b.cyl('steel', 0.032, 0.032, 0.008, 0, RB - 0.012, F(-0.084), 'z', 18);
    rod(b, 'rubber', [0.028, RB + 0.02, F(-0.1)], [0.03, RB + 0.04, F(0.0)], 0.004);
    // a carrying rail along the top, with the open sights on it
    b.box('blued', 0.016, 0.01, 0.22, 0, -0.016, F(0.1), 0.003);
    b.box('blued', 0.014, 0.03, 0.016, 0, -0.034, F(0.0), 0.002);
    b.box('blued', 0.014, 0.03, 0.016, 0, -0.034, F(0.2), 0.002);
    b.box('blued', 0.004, 0.011, 0.006, 0.0065, -0.006, F(0.0), 0.0006);
    b.box('blued', 0.004, 0.011, 0.006, -0.0065, -0.006, F(0.0), 0.0006);
    b.box('blued', 0.0035, 0.011, 0.006, 0, -0.007, F(0.2), 0.0006);
    b.sphere('whiteDot', 0.0024, 0, -0.002, F(0.2), 1, 1, 1, 8);
  });
  // the driver's cap at the back (it thumps back at every nail)
  const cap = k.part((b) => {
    b.cyl('blued', 0.031, 0.031, 0.04, 0, RB + 0.014, F(-0.075), 'z', 18);
    b.cyl('housing', 0.034, 0.034, 0.01, 0, RB + 0.014, F(-0.06), 'z', 18);
  });
  // the nail strip in its rail, from under the nose back to the hand (out of the gun while the next goes in)
  const strip0 = k.part((b) => {
    b.box('metal', 0.02, 0.03, 0.36, 0, RB - 0.078, F(0.26), 0.002, { rx: 0.34 });
    b.box('nails', 0.005, 0.02, 0.34, -0.0115, RB - 0.078, F(0.26), 0.0004, { rx: 0.34 });
    b.box('nails', 0.005, 0.02, 0.34, 0.0115, RB - 0.078, F(0.26), 0.0004, { rx: 0.34 });
    b.box('blued', 0.024, 0.036, 0.02, 0, RB - 0.134, F(0.096), 0.002, { rx: 0.34 });
  });
  inner.muzzle.position.set(0, RB, F(0.485));
  return new ZaryaRig('gvozdomyot', inner, k.stock, k.own, {
    flash: true,
    animate(pose, fired) {
      const t = pose.reloadPhase === 'mag' ? clamp01(pose.reloadT) : 0;
      strip0.visible = !(t > 0.22 && t < 0.5);
      cap.position.z = 0.014 * fired;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Salyut: a battery of five firework tubes fanned on a board, fused together, with two grips under it
// -------------------------------------------------------------------------------------------------

export function createSalyut(tex: SharedTextures): ViewmodelRig {
  const inner = createRpg(tex);
  const paper = [mat(0xb8241e, 0.7), mat(0x1f4fa8, 0.7), mat(0xd8a81c, 0.7)];
  const k = strip(inner, { wood: mat(0x7a5230, 0.7), paper0: paper[0]!, paper1: paper[1]!, paper2: paper[2]!, gold: mat(0xe2c45a, 0.35, 0.8), bore: mat(0x070707, 0.95), cord: mat(0xcfc8ac, 0.85) });
  const N = 5;
  const LEN = 0.4;
  const MID = 0.3;
  const tube = (i: number): { x: number; yaw: number; fx: number; fz: number } => {
    const yaw = -(i - (N - 1) / 2) * 0.07;
    const x = TX + (i - (N - 1) / 2) * 0.046;
    return { x, yaw, fx: x - Math.sin(yaw) * (LEN / 2), fz: F(MID) - Math.cos(yaw) * (LEN / 2) };
  };
  k.part((b) => {
    b.side('wood', RPG_GRIP, 0.03, TX + 0.012, 0.003, 0.9, 0);
    b.side('wood', RPG_FORE, 0.03, TX - 0.01, 0.003, 0.9, 0);
    // the board, its battens, the steel bands over the tubes
    b.box('wood', 0.27, 0.012, 0.4, TX, TY - 0.03, F(0.22), 0.003);
    b.box('wood', 0.27, 0.016, 0.03, TX, TY - 0.042, F(0.07), 0.003);
    b.box('wood', 0.27, 0.016, 0.03, TX, TY - 0.042, F(0.37), 0.003);
    b.box('blued', 0.232, 0.005, 0.02, TX, TY + 0.0225, F(0.19), 0.001);
    b.box('blued', 0.256, 0.005, 0.02, TX, TY + 0.0225, F(0.4), 0.001);
    for (let i = 0; i < N; i++) {
      const t = tube(i);
      const ry = { ry: t.yaw };
      b.cyl(`paper${i % 3}`, 0.021, 0.021, LEN, t.x, TY, F(MID), 'z', 14, ry);
      // a gold band and the dark mouth
      b.cyl('gold', 0.0216, 0.0216, 0.03, t.x - Math.sin(t.yaw) * 0.12, TY, F(MID) - Math.cos(t.yaw) * 0.12, 'z', 14, ry);
      b.cyl('gold', 0.0216, 0.0216, 0.012, t.x + Math.sin(t.yaw) * 0.15, TY, F(MID) + Math.cos(t.yaw) * 0.15, 'z', 14, ry);
      b.cyl('bore', 0.018, 0.018, 0.003, t.fx, TY, t.fz - 0.001, 'z', 12, ry);
      // its fuse, back to the igniter
      rod(b, 'cord', [t.x + Math.sin(t.yaw) * (LEN / 2), TY + 0.004, F(MID) + Math.cos(t.yaw) * (LEN / 2)], [TX + 0.012, TY + 0.012, F(0.045)], 0.0022, 5);
    }
    // the igniter box by the trigger hand, with its button
    b.box('blued', 0.034, 0.026, 0.05, TX + 0.012, TY + 0.004, F(0.03), 0.004);
    b.sphere('red', 0.007, TX + 0.012, TY + 0.02, F(0.03), 1, 0.6, 1, 8);
    // a wire ring sight on the board's left edge
    b.torus('blued', 0.012, 0.0016, 0, 0, F(0.03), undefined, 14);
    b.box('blued', 0.003, 0.09, 0.003, 0, -0.056, F(0.03), 0.0006);
  });
  // the rockets' noses in the mouths of the tubes (gone once the volley is off)
  const noses = k.part((b) => {
    for (let i = 0; i < N; i++) {
      const t = tube(i);
      b.cyl(`paper${(i + 1) % 3}`, 0.0005, 0.0165, 0.05, t.fx - Math.sin(t.yaw) * 0.02, TY, t.fz - Math.cos(t.yaw) * 0.02, 'z', 10, { ry: t.yaw });
    }
  });
  inner.muzzle.position.set(TX, TY, F(0.54));
  return new ZaryaRig('salyut', inner, k.stock, k.own, {
    flash: true,
    animate(pose) {
      const loading = pose.reloadPhase === 'mag';
      noses.visible = loading ? clamp01(pose.reloadT) >= 0.68 : pose.ammo > 0;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Ottepel: a steam lance (a copper pipe in a stove coil with a brass bell, a samovar's belly for a boiler, a valve wheel,
// a pressure gauge whose needle is the "ammunition", and the hose down to the pack)
// -------------------------------------------------------------------------------------------------

export function createOttepel(tex: SharedTextures): ViewmodelRig {
  const inner = createRpg(tex);
  const k = strip(inner, { copper: mat(0xb86a3c, 0.3, 0.9), face: mat(0xf1eee0, 0.6, 0, 0xf1eee0, 0.18), zone: mat(0xc0281c, 0.6), bore: mat(0x070707, 0.95) });
  const GX = 0.014; // the gauge
  const GY = -0.03;
  const GF = 0.03;
  k.part((b) => {
    b.side('grip', RPG_GRIP, 0.03, TX + 0.012, 0.002, 0.9, 0);
    b.side('grip', RPG_FORE, 0.03, TX - 0.01, 0.002, 0.9, 0);
    // the lance and its bell
    b.cyl('copper', 0.015, 0.015, 0.5, TX, TY, F(0.36), 'z', 14);
    b.cyl('brass', 0.035, 0.015, 0.085, TX, TY, F(0.652), 'z', 18);
    b.cyl('brass', 0.037, 0.037, 0.006, TX, TY, F(0.694), 'z', 18);
    b.cyl('bore', 0.031, 0.031, 0.002, TX, TY, F(0.6975), 'z', 16);
    // the stove coil round it, between two collars, and the clamp the forward grip hangs from
    for (let i = 0; i < 8; i++) b.torus('copper', 0.0235, 0.0055, TX, TY, F(0.4 + i * 0.021), undefined, 8);
    b.cyl('blued', 0.021, 0.021, 0.018, TX, TY, F(0.378), 'z', 14);
    b.cyl('blued', 0.021, 0.021, 0.018, TX, TY, F(0.568), 'z', 14);
    b.box('blued', 0.034, 0.03, 0.05, TX - 0.008, TY - 0.022, F(0.3), 0.003);
    // the samovar's belly, on its side: shoulders, waist and foot, its two handles, and the valve wheel on top
    b.lathe('brass', [[0.012, -0.075], [0.03, -0.062], [0.043, -0.03], [0.046, 0.005], [0.04, 0.045], [0.026, 0.07], [0.02, 0.09], [0.0155, 0.1]], TX, TY, 0.06, 22);
    b.cyl('blued', 0.0465, 0.0465, 0.008, TX, TY, F(0.062), 'z', 22);
    b.torus('brass', 0.015, 0.0038, TX + 0.052, TY + 0.004, F(0.06), undefined, 8);
    b.torus('brass', 0.015, 0.0038, TX - 0.052, TY + 0.004, F(0.06), undefined, 8);
    b.cyl('brass', 0.005, 0.005, 0.03, TX, TY + 0.058, F(0.085), 'y', 8);
    b.torus('red', 0.017, 0.0036, TX, TY + 0.074, F(0.085), { rx: Math.PI / 2 }, 8);
    b.box('red', 0.034, 0.003, 0.004, TX, TY + 0.074, F(0.085), 0.0006);
    b.box('red', 0.004, 0.003, 0.034, TX, TY + 0.074, F(0.085), 0.0006);
    // the gauge on its stalk, facing you
    b.cyl('brass', 0.025, 0.025, 0.014, GX, GY, F(GF), 'z', 22);
    b.cyl('face', 0.0215, 0.0215, 0.0012, GX, GY, F(GF) + 0.0072, 'z', 22);
    for (let i = 0; i < 9; i++) {
      const a = -2.1 + (i / 8) * 4.2;
      b.box(i < 2 ? 'zone' : 'bore', 0.0016, 0.005, 0.0008, GX + Math.sin(a) * 0.0175, GY + Math.cos(a) * 0.0175, F(GF) + 0.0082, 0.0002, { rz: -a });
    }
    rod(b, 'brass', [GX + 0.012, GY - 0.02, F(GF)], [TX - 0.03, TY + 0.02, F(0.06)], 0.0045);
    // a bead on a strut, over the collar
    rod(b, 'blued', [TX - 0.012, TY + 0.016, F(0.568)], [0, -0.006, F(0.568)], 0.0026);
    b.sphere('zone', 0.0034, 0, -0.002, F(0.568), 1, 1, 1, 8);
    // the hose, from the boiler's foot down to the pack
    const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(TX, TY, F(-0.012)), new THREE.Vector3(TX + 0.03, TY - 0.012, F(-0.04)), new THREE.Vector3(TX + 0.075, TY - 0.09, F(0.0)), new THREE.Vector3(TX + 0.1, TY - 0.26, F(0.02)), new THREE.Vector3(TX + 0.13, TY - 0.6, F(-0.04))]);
    b.add('rubber', new THREE.TubeGeometry(hose, 14, 0.011, 7, false));
  });
  // the needle (it lies against the red when the boiler is empty and stands right over when it is full)
  const needleGeo = new THREE.BoxGeometry(0.0022, 0.018, 0.0008).translate(0, 0.007, 0);
  const needle = new THREE.Mesh(needleGeo, k.mk('zone'));
  needle.position.set(GX, GY, F(GF) + 0.0092);
  inner.gun.add(needle);
  k.own.push(needleGeo);
  let shown = 1;
  inner.muzzle.position.set(TX, TY, F(0.71));
  return new ZaryaRig('ottepel', inner, k.stock, k.own, {
    flash: false,
    ads: [0.035, -0.04, 0],
    animate(pose, fired) {
      const full = pose.magSize > 0 ? clamp01(pose.ammo / pose.magSize) : 0;
      shown += (full - shown) * 0.25;
      needle.rotation.z = 2.1 - shown * 4.2 + Math.sin(pose.time * 31) * 0.03 * fired;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Raketa: a Soviet canister vacuum cleaner made into a gun (the round enamelled canister slung under the chrome wand
// between the two hands, its corrugated hose looping out of it and up into the wand, a wide floor nozzle on the end,
// and on the canister's back cap, facing you, a dial of six lamps that count what it has swallowed)
// -------------------------------------------------------------------------------------------------

export function createRaketa(tex: SharedTextures): ViewmodelRig {
  const inner = createRpg(tex);
  const lampOn = mat(0xffb040, 0.4, 0, 0xff9a20, 2.2);
  const lampOff = mat(0x3a2a1a, 0.5, 0, 0x000000, 0);
  const k = strip(inner, { enamel: mat(0x8fb7c6, 0.42, 0.05), chrome: mat(0xd2d6da, 0.22, 0.9), stripe: mat(0xb8241e, 0.5), bore: mat(0x070707, 0.95), lampOn, lampOff });
  const WY = TY + 0.004; // the wand's axis
  const W0 = -0.015;
  const W1 = 0.5;
  const CX = TX; // the canister's axis, under the wand
  const CR = 0.06;
  const CY = WY - 0.019 - CR - 0.012;
  const C0 = 0.112; // its back and front (f), between the trigger hand and the other
  const C1 = 0.262;
  // the canister rumbles while it sucks: it is its own group
  const can = new THREE.Group();
  inner.gun.add(can);
  k.part((b) => {
    // the body, its chrome caps, the red band, the ribs round its front (the motor's vents)
    b.cyl('enamel', CR, CR, C1 - C0 - 0.03, CX, CY, F((C0 + C1) / 2), 'z', 24);
    b.cyl('chrome', CR - 0.006, CR + 0.002, 0.016, CX, CY, F(C1 - 0.007), 'z', 24);
    b.cyl('chrome', CR + 0.002, CR - 0.006, 0.016, CX, CY, F(C0 + 0.007), 'z', 24);
    b.cyl('stripe', CR + 0.0015, CR + 0.0015, 0.02, CX, CY, F(C0 + 0.05), 'z', 24);
    for (let i = 0; i < 3; i++) b.torus('chrome', CR + 0.001, 0.002, CX, CY, F(C1 - 0.03 - i * 0.011), undefined, 24);
    // the back cap's dial plate, the lamps' ring is set in it
    b.cyl('blued', CR - 0.012, CR - 0.012, 0.004, CX, CY, F(C0 - 0.001), 'z', 24);
    b.cyl('chrome', 0.012, 0.012, 0.006, CX, CY, F(C0 - 0.003), 'z', 14);
    // two straps hang it from the wand
    for (const f of [C0 + 0.035, C1 - 0.035]) {
      b.box('blued', 0.012, WY - CY - CR + 0.012, 0.014, CX, (WY + CY + CR) / 2, F(f), 0.002);
      b.torus('blued', CR + 0.003, 0.0035, CX, CY, F(f), undefined, 24);
    }
    // the hose's fitting on top of the front cap
    b.cyl('chrome', 0.017, 0.019, 0.022, CX + 0.034, CY + 0.034, F(C1 + 0.006), 'z', 14);
  }, can);
  // the six lamps, a dial down the left of the back cap (the side the eye sees past the wand), top to bottom: lit for
  // every round it holds
  const lampGeo = new THREE.SphereGeometry(0.0058, 10, 8);
  k.own.push(lampGeo);
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.6 + (i / 5) * 0.8);
    const m = new THREE.Mesh(lampGeo, lampOff);
    m.position.set(CX + Math.cos(a) * 0.033, CY + Math.sin(a) * 0.033, F(C0) + 0.004);
    can.add(m);
    lamps.push(m);
  }
  k.part((b) => {
    // the pistol grip under the wand's back, its trigger (the motor's switch) and the block it is bolted through
    b.side('grip', RPG_GRIP, 0.03, TX + 0.012, 0.002, 0.9, 0);
    b.box('blued', 0.03, 0.028, 0.08, TX + 0.004, TY - 0.018, F(0.07), 0.004);
    b.box('red', 0.008, 0.016, 0.01, TX + 0.012, TY - 0.044, F(0.098), 0.002);
    // the corrugated hose: out of the canister's front, round to the right and back, and up into the wand's back end
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(CX + 0.034, CY + 0.034, F(C1 + 0.02)),
      new THREE.Vector3(CX + 0.085, CY + 0.03, F(C1 - 0.01)),
      new THREE.Vector3(CX + 0.095, CY + 0.045, F(0.16)),
      new THREE.Vector3(CX + 0.07, WY + 0.03, F(0.04)),
      new THREE.Vector3(TX + 0.03, WY + 0.022, F(W0 - 0.012)),
      new THREE.Vector3(TX + 0.004, WY + 0.004, F(W0 + 0.004)),
    ]);
    b.add('rubber', new THREE.TubeGeometry(hose, 28, 0.0145, 8, false));
    for (let i = 1; i < 16; i++) {
      const t = i / 16;
      const at = hose.getPointAt(t);
      const tan = hose.getTangentAt(t);
      const ring = new THREE.TorusGeometry(0.0148, 0.0024, 5, 12);
      ring.lookAt(tan);
      ring.translate(at.x, at.y, at.z);
      b.add('blued', ring);
    }
    // the chrome wand, its collars, and the grip the other hand holds
    b.cyl('chrome', 0.0165, 0.018, W1 - W0, TX, WY, F((W0 + W1) / 2), 'z', 14);
    b.cyl('blued', 0.021, 0.021, 0.026, TX, WY, F(W0 + 0.012), 'z', 14);
    b.cyl('blued', 0.02, 0.02, 0.018, TX, WY, F(0.38), 'z', 14);
    b.side('grip', RPG_FORE, 0.028, TX - 0.004, 0.002, 0.9, 0);
    b.box('blued', 0.026, 0.026, 0.05, TX - 0.004, TY - 0.02, F(0.3), 0.003);
    // the floor nozzle: a flared neck, the wide flat mouth with its rubber lip and its dark slot, the little wheels
    b.cyl('chrome', 0.026, 0.018, 0.05, TX, WY, F(W1 + 0.02), 'z', 14);
    b.box('enamel', 0.16, 0.042, 0.06, TX, WY, F(W1 + 0.07), 0.01);
    b.box('chrome', 0.164, 0.008, 0.064, TX, WY + 0.022, F(W1 + 0.07), 0.003);
    b.box('rubber', 0.166, 0.046, 0.012, TX, WY, F(W1 + 0.1), 0.004);
    b.box('bore', 0.14, 0.018, 0.004, TX, WY, F(W1 + 0.107), 0.001);
    for (const x of [-0.068, 0.068]) b.cyl('rubber', 0.011, 0.011, 0.01, TX + x, WY - 0.024, F(W1 + 0.05), 'x', 10);
    // a sighting notch on the neck
    b.box('blued', 0.004, 0.014, 0.004, TX - 0.01, WY + 0.026, F(W1 + 0.02), 0.0008);
  });
  inner.muzzle.position.set(TX, WY, F(W1 + 0.11));
  let lit = -1;
  return new ZaryaRig('raketa', inner, k.stock, k.own, {
    flash: false,
    ads: [0.035, -0.045, 0],
    animate(pose, fired, kick) {
      // the lamps count what it holds
      const n = Math.round(Math.max(0, Math.min(6, pose.ammo)));
      if (n !== lit) {
        lit = n;
        for (let i = 0; i < lamps.length; i++) lamps[i]!.material = i < n ? lampOn : lampOff;
      }
      // sucking (light kicks) the canister rumbles; a blast throws it back a little
      const suck = kick < 0.5 ? fired : 0;
      can.position.set(Math.sin(pose.time * 73) * 0.0012 * suck, Math.sin(pose.time * 91) * 0.0012 * suck, kick >= 0.5 ? 0.01 * fired * fired : 0);
    },
  });
}

export const ZARYA_RIGS: Record<ZaryaGunId, (tex: SharedTextures) => ViewmodelRig> = {
  raketa: createRaketa,
  signalka: createSignalka,
  arbalet: createArbalet,
  gvozdomyot: createGvozdomyot,
  salyut: createSalyut,
  ottepel: createOttepel,
  zenit: createZenit,
};
