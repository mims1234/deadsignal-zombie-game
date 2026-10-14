/**
 * HX-7 rocket launcher viewmodel: an olive launch tube over the right shoulder with a flared rear venturi, a pistol
 * grip and trigger, a forward grip, a flip-up iron sight on the left and a finned rocket seated in the muzzle.
 *
 * Gun space: origin = the sight aperture, +X right, +Y up, -Z forward (f = -z). The tube runs to the right of and
 * below the sight. Reload: the left hand leaves the grip, fetches a rocket from below the screen and seats it.
 */
import * as THREE from 'three';
import type { ViewmodelPose } from '../viewmodelTypes';
import { MuzzleFlash } from './flash';
import { GloveHand, HAND_POSES, clonePose, lerpPose, type HandPose } from './hand';
import { PartBuilder } from './kit';
import { RigMaterials, type SharedTextures } from './materials';
import { Anchor, BaseRig, GunMotion, HandDriver, Target, sampleHandKeys, type GunTuning, type HandKey } from './rigBase';
import { bump, clamp01, seg, smooth } from './util';

const F = (f: number): number => -f;
const TX = 0.088; // tube axis, right of and below the sight
const TY = -0.074;
const TR = 0.038; // tube radius
const FRONT = 0.62; // muzzle (forward distance)
const UV = { grip: 34, polymer: 26, steel: 9, blued: 9, metal: 9, rubber: 14, olive: 14, oliveMetal: 12 };

const TUNE: GunTuning = {
  hipPos: [0.14, -0.085, -0.4],
  hipRot: [0.04, 0.08, 0.0],
  adsPos: [0, 0, -0.52],
  adsRot: [0, 0, 0],
  sprintPos: [0.1, -0.16, -0.36],
  sprintRot: [-0.5, 0.5, 0.3],
  pivot: [TX, TY, 0.05],
  bob: { y: 0.008, x: 0.009, roll: 0.02 },
  sway: { pos: 0.0055, rot: 0.01 },
  kick: { z: 0.07, pitch: 0.2, yaw: 0.03, roll: 0.05, freq: 7, zeta: 0.45, adsMul: 0.75 },
};

export class RpgRig extends BaseRig {
  readonly id = 'rpg' as const;
  private readonly motion = new GunMotion(TUNE);
  private readonly flash: MuzzleFlash;
  private readonly blast: MuzzleFlash;
  private readonly rocket: THREE.Group;
  private readonly handRocket: THREE.Group;
  private readonly trigger: THREE.Group;
  /** The flared rear: it would fill the view through the sight (it is behind your head there), so ADS hides it. */
  private readonly venturi: THREE.Group;
  private readonly rh: GloveHand;
  private readonly lh: GloveHand;
  private readonly rhDrv: HandDriver;
  private readonly lhDrv: HandDriver;
  private readonly aRH = new Anchor(TX + 0.012, TY - 0.085, F(0.07), -0.3, 0, -Math.PI / 2);
  private readonly aLH = new Anchor(TX - 0.012, TY - 0.08, F(0.3), -0.3, 0, Math.PI / 2);
  private readonly aSeat = new Anchor(TX - 0.03, TY + 0.01, F(FRONT + 0.08), -0.2, 0.3, Math.PI / 2);
  private readonly tLH = new Target(this.aLH);
  private readonly tSeat = new Target(this.aSeat);
  private readonly tPouch = new Target(null, -0.12, -0.46, -0.3, 0, 0, Math.PI / 2);
  private readonly tLift = new Target(null, -0.05, -0.26, -0.5, -0.3, 0.2, Math.PI / 2);
  private readonly keys: HandKey[];
  private readonly kPos = new THREE.Vector3();
  private readonly kQuat = new THREE.Quaternion();
  private readonly kPose: HandPose = clonePose(HAND_POSES.grip);
  private readonly tmpPose: HandPose = clonePose(HAND_POSES.gripR);
  private readonly rocketOffset = new THREE.Vector3(0.0, 0.035, -0.07);
  private lastAds = 0;
  private trig = 0;
  private readonly elbowR = new THREE.Vector3(0.26, -0.42, 0.3);
  private readonly elbowL = new THREE.Vector3(-0.2, -0.44, 0.25);

  constructor(tex: SharedTextures) {
    super(new RigMaterials(tex));
    const mk = (k: string) => this.mats.get(k);

    const body = new PartBuilder();
    buildTube(body);
    this.gun.add(body.build(mk, UV));
    this.disposables.push(body);
    const rear = new PartBuilder();
    rear.lathe('blued', [[TR + 0.004, -0.06], [TR + 0.01, -0.1], [TR + 0.024, -0.15], [TR + 0.02, -0.16], [TR - 0.004, -0.08]], TX, TY, 0, 22);
    this.venturi = rear.build(mk, UV);
    this.gun.add(this.venturi);
    this.disposables.push(rear);

    const tr = new PartBuilder();
    tr.box('steel', 0.006, 0.02, 0.006, 0, 0, 0, 0.001);
    this.trigger = tr.build(mk, UV);
    this.trigger.position.set(TX + 0.012, TY - 0.06, F(0.1));
    this.gun.add(this.trigger);
    this.disposables.push(tr);

    // the seated rocket, and the one carried in the left hand while reloading
    const rk = new PartBuilder();
    buildRocket(rk);
    this.rocket = rk.build(mk, UV);
    this.rocket.position.set(TX, TY, F(FRONT));
    this.gun.add(this.rocket);
    this.handRocket = this.rocket.clone(true);
    this.handRocket.visible = false;
    this.root.add(this.handRocket);
    this.disposables.push(rk);

    const tA = new PartBuilder();
    const tB = new PartBuilder();
    tA.box('accentA', 0.004, 0.004, 0.42, TX - TR - 0.001, TY, F(0.3), 0.001);
    tA.box('accentA', 0.03, 0.004, 0.004, TX, TY + TR + 0.001, F(0.5), 0.001);
    tB.box('accentB', 0.004, 0.004, 0.42, TX + TR + 0.001, TY, F(0.3), 0.001);
    tB.cyl('accentB', TR + 0.004, TR + 0.004, 0.006, TX, TY, F(FRONT - 0.01), 'z', 20);
    tB.cyl('accentB', TR + 0.004, TR + 0.004, 0.006, TX, TY, F(0.0), 'z', 20);
    const accA = tA.build(mk, UV);
    const accB = tB.build(mk, UV);
    this.gun.add(accA, accB);
    this.addTierPart(accA, 1);
    this.addTierPart(accB, 2);
    this.disposables.push(tA, tB);

    this.muzzle.position.set(TX, TY, F(FRONT + 0.02));
    this.ejectPort.position.set(TX, TY, F(-0.16));
    this.flash = new MuzzleFlash(this.mats.tex, 0.34, 0.5);
    this.muzzle.add(this.flash.group);
    this.blast = new MuzzleFlash(this.mats.tex, 0.3, 0.2);
    this.blast.group.rotation.y = Math.PI; // the back-blast leaves the venturi
    this.ejectPort.add(this.blast.group);
    this.disposables.push(this.flash, this.blast);

    this.rh = new GloveHand({ side: 'right', seed: 23 }, this.mats);
    this.lh = new GloveHand({ side: 'left', watch: true, seed: 25 }, this.mats);
    this.root.add(this.rh.root, this.lh.root);
    this.disposables.push(this.rh, this.lh);
    this.rhDrv = new HandDriver(this.rh, this.elbowR);
    this.lhDrv = new HandDriver(this.lh, this.elbowL);

    const K = (t: number, target: Target, pose: HandKey['pose']): HandKey => ({ t, target, pose });
    this.keys = [
      K(0.0, this.tLH, 'grip'),
      K(0.12, this.tLH, 'open'),
      K(0.3, this.tPouch, 'open'),
      K(0.4, this.tPouch, 'hold'),
      K(0.55, this.tLift, 'hold'),
      K(0.68, this.tSeat, 'hold'),
      K(0.76, this.tSeat, 'open'),
      K(0.9, this.tLH, 'grip'),
      K(1.0, this.tLH, 'grip'),
    ];
    this.setTier(0);
  }

  onFire(tier: number, strength = 1): void {
    this.motion.kick(strength, this.lastAds);
    this.flash.trigger(tier, 1.5);
    this.blast.trigger(tier, 1.2);
  }

  reset(): void {
    this.motion.reset();
    this.flash.reset();
    this.blast.reset();
    this.trig = 0;
    this.handRocket.visible = false;
  }

  update(pose: ViewmodelPose, dt: number): void {
    this.time = pose.time;
    const vis = pose.raise > 0.015;
    this.root.visible = vis;
    if (!vis) return;
    this.lastAds = pose.ads;
    this.venturi.visible = pose.ads < 0.55;
    const m = this.motion;
    m.compute(pose, dt);
    const d = m.out;
    const reloading = pose.reloadPhase === 'mag';
    const t = reloading ? clamp01(pose.reloadT) : 0;

    // the trigger follows the shot
    const c = clamp01(pose.cycle);
    this.trig += ((c < 0.2 ? 1 : 0) - this.trig) * (1 - Math.exp(-dt * 40));
    this.trigger.rotation.x = -0.35 * this.trig;

    if (reloading) {
      // tube comes down off the shoulder and tilts the muzzle toward the free hand
      const dip = smooth(seg(t, 0, 0.18)) * (1 - smooth(seg(t, 0.82, 1)));
      d.dPos.y -= 0.05 * dip;
      d.dPos.x -= 0.03 * dip;
      d.dRot.x -= 0.18 * dip;
      d.dRot.z -= 0.22 * dip;
      d.dRot.y += 0.15 * dip;
      const seat = bump(t, 0.64, 0.74);
      d.dPos.z += 0.012 * seat;
    }
    m.apply(this.gun);

    this.tLH.refresh(this.gun);
    this.tSeat.refresh(this.gun);

    lerpPose(HAND_POSES.gripR, HAND_POSES.gripRFire, this.trig, this.tmpPose);
    this.rh.setPose(this.tmpPose);
    this.rhDrv.place(this.gun, this.aRH);

    // rocket: seated when loaded; during a reload it is fetched by the left hand
    const loaded = pose.ammo > 0;
    if (reloading) {
      sampleHandKeys(this.keys, t, this.kPos, this.kQuat, this.kPose);
      this.lh.setPose(this.kPose);
      this.lhDrv.placeFree(this.kPos, this.kQuat);
      const inHand = t >= 0.38 && t < 0.68;
      this.rocket.visible = t >= 0.68 || (!pose.reloadEmpty && t < 0.12);
      this.handRocket.visible = inHand;
      if (inHand) {
        this.handRocket.quaternion.copy(this.gun.quaternion);
        this.handRocket.position.copy(this.rocketOffset).applyQuaternion(this.gun.quaternion).add(this.lh.root.position);
      }
    } else {
      this.rocket.visible = loaded;
      this.handRocket.visible = false;
      this.lh.setPose(HAND_POSES.grip);
      this.lhDrv.place(this.gun, this.aLH);
    }

    this.flash.update(dt);
    this.blast.update(dt);
    this.mats.pulse(pose.time);
    this.root.updateMatrixWorld(true);
  }
}

// -------------------------------------------------------------------------------------------------
// Geometry
// -------------------------------------------------------------------------------------------------

function buildTube(b: PartBuilder): void {
  // launch tube
  b.cyl('olive', TR, TR, FRONT + 0.06, TX, TY, F((FRONT - 0.06) / 2), 'z', 22);
  // muzzle ring (the flared rear venturi is its own part)
  b.cyl('blued', TR + 0.006, TR + 0.006, 0.03, TX, TY, F(FRONT - 0.02), 'z', 22);
  // heat shield wraps
  b.cyl('fabricOlive', TR + 0.008, TR + 0.008, 0.16, TX, TY, F(0.14), 'z', 22);
  b.cyl('rubber', TR + 0.005, TR + 0.005, 0.012, TX, TY, F(0.43), 'z', 22);
  // pistol grip and trigger guard (under the tube)
  b.side('grip', [[0.1, TY - 0.03], [0.09, TY - 0.06], [0.07, TY - 0.13], [0.03, TY - 0.13], [0.045, TY - 0.06], [0.05, TY - 0.03]], 0.03, TX + 0.012, 0.002);
  b.box('blued', 0.024, 0.004, 0.06, TX + 0.012, TY - 0.072, F(0.11), 0.0015);
  b.box('blued', 0.024, 0.03, 0.005, TX + 0.012, TY - 0.058, F(0.14), 0.0015);
  // forward grip
  b.side('grip', [[0.32, TY - 0.03], [0.31, TY - 0.12], [0.27, TY - 0.12], [0.28, TY - 0.03]], 0.03, TX - 0.01, 0.002);
  // sight: a post on the front, an aperture plate at the origin, joined by a bracket on the tube's left
  b.box('blued', 0.012, 0.03, 0.01, 0, -0.016, F(0.0), 0.001);
  b.box('blued', 0.004, 0.012, 0.004, 0, 0.0, F(0.0), 0.0005);
  b.box('blued', 0.004, 0.012, 0.004, 0, 0.0, F(0.0), 0.0005, { rz: Math.PI / 2 });
  b.box('blued', 0.006, 0.026, 0.006, 0, -0.012, F(0.4), 0.001);
  b.cyl('whiteDot', 0.0016, 0.0016, 0.001, 0, 0.0005, F(0.397), 'z', 8);
  b.box('blued', 0.03, 0.008, 0.46, TX - TR + 0.004, TY + TR * 0.5, F(0.2), 0.0015);
  // brackets from the tube out to the sight line
  b.box('blued', TX - TR + 0.01, 0.008, 0.02, (TX - TR) / 2, -0.024, F(0.4), 0.001);
  b.box('blued', TX - TR + 0.01, 0.008, 0.02, (TX - TR) / 2, -0.024, F(0.0), 0.001);
  // sling swivels
  b.box('steel', 0.004, 0.012, 0.012, TX, TY - TR - 0.005, F(0.5), 0.001);
  b.box('steel', 0.004, 0.012, 0.012, TX, TY - TR - 0.005, F(-0.02), 0.001);
}

/** Rocket in its own frame: the motor sits in the tube (f < 0), the warhead sticks out (f > 0). */
function buildRocket(b: PartBuilder): void {
  b.cyl('oliveMetal', TR * 0.62, TR * 0.62, 0.06, 0, 0, F(0.0), 'z', 16);
  b.lathe('olive', [[0.001, 0.2], [TR * 0.35, 0.18], [TR * 1.05, 0.08], [TR * 1.1, 0.04], [TR * 0.7, 0.0], [TR * 0.62, -0.01]], 0, 0, 0, 18);
  b.cyl('blued', 0.006, 0.006, 0.03, 0, 0, F(0.21), 'z', 8);
  b.cyl('red', TR * 1.11, TR * 1.11, 0.008, 0, 0, F(0.06), 'z', 18);
}

export function createRpg(tex: SharedTextures): RpgRig {
  return new RpgRig(tex);
}
