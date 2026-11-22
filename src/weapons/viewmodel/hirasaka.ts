/**
 * HIRASAKA's built guns, in your hands (arms wave): each stands on a stock rig for its HANDS and MOTION only, as ZARYA's
 * do (`viewmodel/zarya.ts`, whose `ZaryaRig` and `strip` these reuse): the launcher's for the Happa and the Ōkamuzumi,
 * the rifle's for the Sakuganki and the Mori, the pistol's for the Kushi-bi. What moves on each is driven from the
 * `ViewmodelPose`: the Happa's charge in its mouth, the drill steel hammering, the harpoon gone from the barrel until
 * it is reloaded, the comb's teeth burning down one by one (lit ones flame, spent ones are charred stubs).
 *
 * Gun space is the stock rig's: origin = its sight point, +X right, +Y up, -Z forward (`F(f)` = a distance forward).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HIRASAKA_GUNS, teethLit } from '../../logic/hirasakaGuns';
import type { HirasakaGunId } from '../../types';
import type { ViewmodelRig } from '../viewmodelTypes';
import type { SharedTextures } from './materials';
import { createPistol } from './pistol';
import { createRifle } from './rifle';
import { createRpg } from './rpg';
import { clamp01, seg, smooth } from './util';
import { F, PISTOL_GRIP, RB, RIFLE_FORE, RIFLE_GRIP, RPG_FORE, RPG_GRIP, TX, TY, ZaryaRig, mat, rod, strip } from './zarya';

// -------------------------------------------------------------------------------------------------
// Happa: a steel launch pipe on a wooden stock, a bundle of blasting sticks in its mouth, the exploder box under it
// -------------------------------------------------------------------------------------------------

export function createHappa(tex: SharedTextures): ViewmodelRig {
  const inner = createRpg(tex);
  const k = strip(inner, { wood: mat(0x6a4a2c, 0.75), pipe: mat(0x4a4d50, 0.5, 0.6), charge: mat(0xb8321e, 0.6), paper: mat(0xd8c89a, 0.85), bore: mat(0x070707, 0.95), box: mat(0x2e4a38, 0.55, 0.2), lamp: mat(0x401008, 0.4, 0, 0xff3010, 1.4) });
  k.part((b) => {
    b.side('wood', RPG_GRIP, 0.03, TX + 0.012, 0.003, 0.9, 0);
    b.side('wood', RPG_FORE, 0.03, TX - 0.01, 0.003, 0.9, 0);
    b.cyl('pipe', 0.046, 0.046, 0.62, TX, TY, F(0.26), 'z', 18);
    b.cyl('pipe', 0.052, 0.052, 0.04, TX, TY, F(0.56), 'z', 18);
    b.cyl('pipe', 0.05, 0.05, 0.03, TX, TY, F(-0.03), 'z', 18);
    b.cyl('bore', 0.04, 0.04, 0.004, TX, TY, F(0.582), 'z', 14);
    // the stock behind, the exploder box hung under the pipe with its plunger and red lamp
    b.box('wood', 0.05, 0.06, 0.2, TX, TY - 0.02, F(-0.14), 0.006);
    b.box('box', 0.07, 0.07, 0.1, TX, TY - 0.09, F(0.16), 0.006);
    b.cyl('pipe', 0.008, 0.008, 0.05, TX, TY - 0.03, F(0.16), 'y', 8);
    b.sphere('lamp', 0.009, TX + 0.036, TY - 0.07, F(0.13), 1, 1, 1, 8);
    rod(b, 'paper', [TX - 0.03, TY - 0.1, F(0.12)], [TX - 0.04, TY - 0.02, F(0.4)], 0.004, 5);
    // a ring sight on the pipe's left
    b.torus('pipe', 0.012, 0.0018, TX - 0.055, TY + 0.03, F(0.05), undefined, 14);
  });
  // the charge in the mouth: three red sticks bound in paper, a fuse cap on the front
  const charge = k.part((b) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.cyl('charge', 0.017, 0.017, 0.16, TX + Math.cos(a) * 0.018, TY + Math.sin(a) * 0.018, F(0.6), 'z', 10);
    }
    b.cyl('paper', 0.039, 0.039, 0.03, TX, TY, F(0.6), 'z', 14);
    b.cyl('pipe', 0.012, 0.012, 0.02, TX, TY, F(0.69), 'z', 10);
  });
  inner.muzzle.position.set(TX, TY, F(0.7));
  return new ZaryaRig('happa', inner, k.stock, k.own, {
    flash: true,
    animate(pose) {
      const loading = pose.reloadPhase === 'mag';
      charge.visible = loading ? clamp01(pose.reloadT) >= 0.7 : pose.ammo > 0;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Sakuganki: a pneumatic rock drill turned into a lance (the drill's body on the rifle's grip, its hose looping back,
// a long drill steel out ahead that hammers forward with each stroke)
// -------------------------------------------------------------------------------------------------

export function createSakuganki(tex: SharedTextures): ViewmodelRig {
  const inner = createRifle(tex);
  const k = strip(inner, { body: mat(0x7a7f84, 0.42, 0.7), paint: mat(0x3c5a7a, 0.5, 0.2), hose: mat(0x1a1a1a, 0.9), steel: mat(0xb8bcc0, 0.3, 0.85), wood: mat(0x6a4a2c, 0.75) });
  k.part((b) => {
    b.side('wood', RIFLE_GRIP, 0.032, 0, 0.004, 0.9, 0);
    b.side('wood', RIFLE_FORE, 0.034, 0, 0.004, 0.9, 0);
    // the drill's body: a fat ribbed cylinder, painted, with its valve block and throttle lever
    b.cyl('paint', 0.045, 0.045, 0.24, 0, RB, F(0.05), 'z', 18);
    for (let i = 0; i < 6; i++) b.cyl('body', 0.048, 0.048, 0.01, 0, RB, F(-0.04 + i * 0.035), 'z', 18);
    b.cyl('body', 0.032, 0.04, 0.08, 0, RB, F(0.2), 'z', 16);
    b.box('body', 0.05, 0.04, 0.07, 0, RB + 0.05, F(0.02), 0.006);
    b.box('body', 0.012, 0.03, 0.05, 0, RB - 0.06, F(0.02), 0.003, { rx: 0.3 });
    // the chuck at the front
    b.cyl('body', 0.022, 0.026, 0.05, 0, RB, F(0.26), 'z', 14);
    // the air hose, off the back and down out of sight
    rod(b, 'hose', [0, RB, F(-0.08)], [0.03, RB - 0.04, F(-0.16)], 0.014, 8);
    rod(b, 'hose', [0.03, RB - 0.04, F(-0.16)], [0.07, RB - 0.2, F(-0.2)], 0.014, 8);
  });
  // the drill steel: hexagonal, a cross bit at the tip (it hammers forward)
  const steel = new THREE.Group();
  inner.gun.add(steel);
  k.part((b) => {
    b.cyl('steel', 0.011, 0.011, 0.52, 0, RB, F(0.54), 'z', 6);
    b.box('steel', 0.05, 0.01, 0.022, 0, RB, F(0.8), 0.002);
    b.box('steel', 0.01, 0.05, 0.022, 0, RB, F(0.8), 0.002);
  }, steel);
  inner.muzzle.position.set(0, RB, F(0.82));
  let spin = 0;
  return new ZaryaRig('sakuganki', inner, k.stock, k.own, {
    flash: false,
    animate(pose, fired) {
      spin += fired * 0.9;
      steel.position.z = F(0.05 * fired);
      steel.rotation.z = spin;
      void pose;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Mori: a whaler's harpoon gun on the seawall winch's frame (a short steel barrel, the barbed harpoon in it, the line
// reel under the stock and its spring)
// -------------------------------------------------------------------------------------------------

export function createMori(tex: SharedTextures): ViewmodelRig {
  const inner = createRifle(tex);
  const k = strip(inner, { wood: mat(0x5a3c22, 0.7), barrel: mat(0x3a3e42, 0.45, 0.7), brass: mat(0xc09a48, 0.3, 0.9), line: mat(0xd8cfa8, 0.85), head: mat(0xc8ccd0, 0.3, 0.85) });
  k.part((b) => {
    b.side('wood', RIFLE_GRIP, 0.034, 0, 0.004, 0.9, 0);
    b.side('wood', RIFLE_FORE, 0.036, 0, 0.004, 0.9, 0);
    b.box('wood', 0.05, 0.06, 0.32, 0, RB - 0.01, F(0.05), 0.008);
    b.cyl('barrel', 0.02, 0.022, 0.46, 0, RB + 0.012, F(0.4), 'z', 16);
    b.cyl('brass', 0.025, 0.025, 0.03, 0, RB + 0.012, F(0.62), 'z', 16);
    b.cyl('brass', 0.025, 0.025, 0.03, 0, RB + 0.012, F(0.2), 'z', 16);
    // the reel under the stock, wound with line, and the spring housing
    b.cyl('barrel', 0.05, 0.05, 0.04, 0, RB - 0.08, F(0.12), 'x', 18);
    b.cyl('line', 0.044, 0.044, 0.034, 0, RB - 0.08, F(0.12), 'x', 18);
    b.cyl('barrel', 0.014, 0.014, 0.18, 0.03, RB - 0.04, F(0.3), 'z', 10);
    for (let i = 0; i < 7; i++) b.torus('brass', 0.016, 0.0025, 0.03, RB - 0.04, F(0.22 + i * 0.024), undefined, 10);
    rod(b, 'line', [0, RB - 0.04, F(0.12)], [0, RB + 0.03, F(0.6)], 0.002, 4);
  });
  // the harpoon, its shaft in the barrel, the barbed head standing out ahead
  const harpoon = k.part((b) => {
    b.cyl('head', 0.007, 0.007, 0.2, 0, RB + 0.012, F(0.72), 'z', 8);
    b.cyl('head', 0.0005, 0.016, 0.07, 0, RB + 0.012, F(0.85), 'z', 8);
    b.box('head', 0.004, 0.05, 0.03, 0, RB + 0.012, F(0.8), 0.001, { rx: 0.5 });
    b.box('head', 0.05, 0.004, 0.03, 0, RB + 0.012, F(0.8), 0.001, { ry: 0.5 });
  });
  inner.muzzle.position.set(0, RB + 0.012, F(0.64));
  return new ZaryaRig('mori', inner, k.stock, k.own, {
    flash: false,
    animate(pose) {
      const loading = pose.reloadPhase === 'mag';
      harpoon.visible = loading ? clamp01(pose.reloadT) >= 0.6 : pose.ammo > 0;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Kushi-bi: Genzō's lacquered comb held up in the fist, its teeth lit one by one; spent teeth are charred stubs
// -------------------------------------------------------------------------------------------------

const TEETH = HIRASAKA_GUNS.kushibi.teeth;

/** One geometry of `n` copies of `make(i)`, in order, so a draw range shows the first few. */
function strip10(make: (i: number) => THREE.BufferGeometry): { geo: THREE.BufferGeometry; per: number } {
  const parts = Array.from({ length: TEETH }, (_, i) => make(i).toNonIndexed());
  const per = parts[0]!.attributes.position!.count;
  const geo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return { geo, per };
}

export function createKushibi(tex: SharedTextures): ViewmodelRig {
  const inner = createPistol(tex);
  const lacquer = mat(0x5a1410, 0.3, 0.1);
  const k = strip(inner, { lacquer, gold: mat(0xd8b050, 0.3, 0.9), wrap: mat(0x2a1a10, 0.85) });
  // the comb held up on the fist (below the sight line, so it never covers the crosshair), its spine across, the teeth
  // pointing ahead and up; a lacquered comb is small: 10 cm across
  const CY = -0.045;
  const CZ = F(0.07);
  const W = 0.1;
  k.part((b) => {
    b.side('wrap', PISTOL_GRIP, 0.03, 0, 0.004, 0.9, 0);
    // a strip of cloth bound round the fist's hold, and the comb's spine: lacquered red with a gold line
    b.box('wrap', 0.03, 0.05, 0.03, 0, -0.06, F(0.02), 0.004);
    b.box('lacquer', W, 0.018, 0.008, 0, CY, CZ, 0.003, { rx: -0.5 });
    b.box('gold', W + 0.002, 0.003, 0.009, 0, CY + 0.007, CZ - 0.004, 0.001, { rx: -0.5 });
  });
  // the teeth: in burning order (the tooth on the right burns first), whole teeth then stubs; a draw range on each
  // geometry shows the lit (whole) teeth and the spent ones (stubs)
  const LEN = 0.03;
  const tx = (i: number): number => W * 0.45 - (i * W * 0.9) / (TEETH - 1);
  const tooth = (i: number, len: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(0.0035, len, 0.0025);
    g.translate(0, len / 2, 0);
    g.rotateX(-0.75);
    g.translate(tx(i), CY + 0.008, CZ - 0.005);
    return g;
  };
  const whole = strip10((i) => tooth(i, LEN));
  const stubs = strip10((i) => tooth(i, LEN * 0.3));
  const flames = strip10((i) => {
    const g = new THREE.ConeGeometry(0.0045, 0.018, 6);
    g.translate(0, 0.009, 0);
    g.translate(tx(i), CY + 0.008 + Math.cos(0.75) * LEN, CZ - 0.005 - Math.sin(0.75) * LEN);
    return g;
  });
  const char = mat(0x0c0806, 0.95);
  const fire = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
  const wholeM = new THREE.Mesh(whole.geo, lacquer);
  const stubM = new THREE.Mesh(stubs.geo, char);
  const flameM = new THREE.Mesh(flames.geo, fire);
  for (const m of [wholeM, stubM, flameM]) {
    m.frustumCulled = false;
    inner.gun.add(m);
  }
  const own = [...k.own, whole.geo, stubs.geo, flames.geo, char, fire];
  inner.muzzle.position.set(0, CY + 0.04, CZ - 0.04);
  let flick = 0;
  return new ZaryaRig('kushibi', inner, k.stock, own, {
    flash: false,
    animate(pose, fired) {
      // lit teeth: the ones left, counted from the last to burn; while relighting they light one by one
      const loading = pose.reloadPhase === 'mag';
      const lit = loading ? Math.round(TEETH * smooth(seg(clamp01(pose.reloadT), 0.15, 0.85))) : teethLit(pose.ammo, Math.max(1, pose.magSize));
      const spent = TEETH - lit;
      wholeM.geometry.setDrawRange(spent * whole.per, lit * whole.per);
      flameM.geometry.setDrawRange(spent * flames.per, lit * flames.per);
      stubM.geometry.setDrawRange(0, spent * stubs.per);
      flick += 0.37;
      flameM.scale.setScalar(1);
      flameM.position.y = 0.002 * Math.sin(flick * 3.1) + 0.004 * fired;
      fire.opacity = 0.75 + 0.2 * Math.sin(flick * 5.3) + 0.05 * fired;
    },
  });
}

// -------------------------------------------------------------------------------------------------
// Ōkamuzumi: the comb's light grown into a cannon (a bell-mouthed bronze barrel bound with sacred rope, a glowing
// peach in its breech)
// -------------------------------------------------------------------------------------------------

export function createOkamuzumi(tex: SharedTextures): ViewmodelRig {
  const inner = createRpg(tex);
  const k = strip(inner, { bronze: mat(0x8a6a3a, 0.35, 0.85), rope: mat(0xd8c89a, 0.9), paper: mat(0xf4f0e6, 0.8), peach: mat(0x401020, 0.4, 0, 0xffa0c0, 1.6), wood: mat(0x3a2a1c, 0.7) });
  k.part((b) => {
    b.side('wood', RPG_GRIP, 0.03, TX + 0.012, 0.003, 0.9, 0);
    b.side('wood', RPG_FORE, 0.03, TX - 0.01, 0.003, 0.9, 0);
    b.cyl('bronze', 0.05, 0.042, 0.5, TX, TY, F(0.25), 'z', 18);
    b.cyl('bronze', 0.085, 0.05, 0.12, TX, TY, F(0.56), 'z', 20);
    b.cyl('bronze', 0.058, 0.058, 0.08, TX, TY, F(-0.04), 'z', 18);
    for (let i = 0; i < 3; i++) b.torus('rope', 0.053, 0.008, TX, TY, F(0.12 + i * 0.03), undefined, 16);
    // paper streamers hung off the rope
    for (let i = 0; i < 3; i++) b.box('paper', 0.016, 0.05, 0.003, TX - 0.03 + i * 0.03, TY - 0.07, F(0.15), 0.001);
  });
  const peach = k.part((b) => {
    b.sphere('peach', 0.04, TX, TY, F(-0.09), 1, 0.95, 1, 14);
  });
  inner.muzzle.position.set(TX, TY, F(0.64));
  return new ZaryaRig('okamuzumi', inner, k.stock, k.own, {
    flash: true,
    animate(pose, fired) {
      const loading = pose.reloadPhase === 'mag';
      peach.visible = loading ? clamp01(pose.reloadT) >= 0.5 : pose.ammo > 0;
      peach.scale.setScalar(1 + 0.04 * Math.sin(pose.time * 4) - 0.2 * fired);
    },
  });
}

export const HIRASAKA_RIGS: Record<HirasakaGunId, (tex: SharedTextures) => ViewmodelRig> = {
  happa: createHappa,
  sakuganki: createSakuganki,
  mori: createMori,
  kushibi: createKushibi,
  okamuzumi: createOkamuzumi,
};
