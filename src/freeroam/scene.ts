/**
 * The scene, start to end, on a 32-second loop. One clock drives the figures, the effects, the sound and (in film
 * mode) the camera, so they can never drift apart.
 *
 *   0    STILLNESS         the knight stands with her sword planted; the giant waits across the courtyard
 *   4    THE SHADOW RISES  black tendrils climb out of the ground around her; the giant roars
 *   8    CLASH             he charges, she meets him halfway: four exchanges, then she leaps back
 *  13.5  CHARGE            she lifts the blade overhead; darkness pours into it; a column of light splits the sky
 *  17.5  EXCALIBUR         she brings it down: a wave of black-red light crosses the courtyard
 *  19    (cut to black)
 *  19.4  IMPACT            the blast: fire, rubble, shockwaves
 *  24    AFTERMATH         rings of light rise from the crater; the shadow sinks back
 *  28.5  STILLNESS         the giant re-forms from the ashes, and it begins again
 */
import * as THREE from 'three';
import { easePose, Giant, GIANT_POSES, type GiantPose, Knight, KNIGHT_POSES, type KnightPose } from './actors';
import type { Fx } from './fx';
import { FOG_BASE, GIANT_HOME, GIANT_STAND, KNIGHT_HOME, type World } from './world';

export const LOOP = 32;

export const PHASES: [number, string][] = [
  [0, 'Stillness'],
  [4, 'The shadow rises'],
  [8, 'Clash'],
  [13.5, 'Charge'],
  [17.5, 'Excalibur'],
  [19.4, 'Impact'],
  [24, 'Aftermath'],
  [28.5, 'Stillness'],
];

/** Moments the sound hangs off (the director calls `cue` as the clock crosses each one). */
export type Cue = 'roar' | 'shadow' | 'charge-run' | 'dash' | 'clash' | 'clash-big' | 'leap' | 'charge' | 'release' | 'black' | 'impact' | 'ring' | 'reform' | 'loop';

const EXCHANGES = [9.6, 10.35, 11.0, 11.6];
const CLASH_AT = new THREE.Vector3(0, 0, -2);

const seg = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number): number => x * x * (3 - 2 * x);
const outCubic = (x: number): number => 1 - Math.pow(1 - x, 3);

export class Director {
  t = 0;
  /** camera shake, 0..1, and where it comes from */
  shake = 0;
  readonly shakeAt = new THREE.Vector3();
  /** full-screen flash: colour and strength */
  flash = 0;
  flashBlack = false;
  onCue: (cue: Cue, at: THREE.Vector3) => void = () => {};

  private prev = 0;
  private readonly kPos = new THREE.Vector3();
  private readonly gPos = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly beamFrom = new THREE.Vector3();
  private readonly beamTo = new THREE.Vector3();
  private readonly fog = new THREE.Color();
  private readonly blastAt = GIANT_STAND.clone().setY(2.5);

  constructor(
    private readonly knight: Knight,
    private readonly giant: Giant,
    private readonly fx: Fx,
    private readonly world: World,
  ) {}

  restart(): void {
    this.t = 0;
    this.prev = 0;
    this.fx.reset();
    this.onCue('loop', KNIGHT_HOME);
  }

  phase(): string {
    let name = PHASES[0][1];
    for (const [at, n] of PHASES) if (this.t >= at) name = n;
    return name;
  }

  private crossed(at: number): boolean {
    return this.prev < at && this.t >= at;
  }

  update(dt: number, clock: number): void {
    this.prev = this.t;
    this.t += dt;
    if (this.t >= LOOP) {
      this.restart();
      this.t = 0;
    }
    const t = this.t;
    const k = this.knight;
    const g = this.giant;
    const fx = this.fx;

    // ---------------- where everyone stands ----------------
    this.knightPos(t, this.kPos);
    this.giantPos(t, this.gPos);
    k.root.position.copy(this.kPos);
    g.root.position.copy(this.gPos);
    k.root.rotation.y = Math.atan2(this.gPos.x - this.kPos.x, this.gPos.z - this.kPos.z);
    g.root.rotation.y = Math.atan2(this.kPos.x - this.gPos.x, this.kPos.z - this.gPos.z);

    // ---------------- poses ----------------
    let kp: KnightPose = KNIGHT_POSES.idle;
    let kRate = 3;
    k.stride = 0;
    if (t < 5.5) kp = KNIGHT_POSES.idle;
    else if (t < 9) (kp = KNIGHT_POSES.guard), (kRate = 4);
    else if (t < 9.6) (kp = KNIGHT_POSES.dash), (kRate = 12), (k.stride = 1);
    else if (t < 12.2) {
      const i = EXCHANGES.filter((x) => t >= x).length;
      kp = i % 2 ? KNIGHT_POSES.slashA : KNIGHT_POSES.slashB;
      kRate = 16;
    } else if (t < 13.5) (kp = KNIGHT_POSES.guard), (kRate = 6);
    else if (t < 17.5) (kp = KNIGHT_POSES.overhead), (kRate = 2.4);
    else if (t < 24.5) (kp = KNIGHT_POSES.release), (kRate = 18);
    else (kp = KNIGHT_POSES.idle), (kRate = 1.6);
    easePose(k.pose, kp, kRate, dt);

    let gp: GiantPose = GIANT_POSES.idle;
    let gRate = 3;
    g.stride = 0;
    if (t < 6.3) gp = GIANT_POSES.idle;
    else if (t < 8) (gp = GIANT_POSES.roar), (gRate = 5);
    else if (t < 9.6) (gp = GIANT_POSES.charge), (gRate = 6), (g.stride = 1);
    else if (t < 12.2) {
      const i = EXCHANGES.filter((x) => t >= x).length;
      gp = i % 2 ? GIANT_POSES.cleave : GIANT_POSES.raised;
      gRate = 10;
    } else if (t < 13.6) (gp = GIANT_POSES.stagger), (gRate = 5), (g.stride = 0.5);
    else if (t < 17.8) (gp = GIANT_POSES.brace), (gRate = 3);
    else (gp = GIANT_POSES.struck), (gRate = 8);
    easePose(g.pose, gp, gRate, dt);

    // the giant is unmade by the blast, and re-forms from the crater
    const reform = seg(t, 28.5, 31);
    g.root.visible = t < 19 || t >= 28.5;
    g.root.scale.setScalar(t >= 28.5 ? Math.max(0.01, smooth(reform)) : 1);
    const rage = t < 6.3 ? 0.3 : t < 19 ? 1 : reform;
    g.eyes.color.setRGB(1 + rage * 4, 0.15 + rage * 0.2, 0.1);
    g.skin.emissive.setRGB(0.25 * (1 - reform) * (t >= 28.5 ? 1 : 0) + (t > 17.6 && t < 19 ? 0.6 : 0), 0.02, 0.06 * (t > 17.6 && t < 19 ? 1 : 0));

    k.update(dt, clock);
    g.update(dt, clock);
    k.tip.getWorldPosition(this.tip);

    // ---------------- the shadow ----------------
    const charge = seg(t, 13.6, 17.4);
    // they pour into the blade on the downswing, then creep back while the dust settles, and sink away
    const grow = smooth(seg(t, 4, 7.5)) * (1 - 0.9 * smooth(seg(t, 17.45, 17.8)) + 0.5 * smooth(seg(t, 20, 23))) * (1 - smooth(seg(t, 23, 26.5)));
    const motes = 0.12 + smooth(seg(t, 4, 7)) * 0.7 + charge * 0.6 - seg(t, 17.5, 18) * 0.9 + seg(t, 24, 28) * 0.4;
    fx.setShadow(grow, charge, Math.max(0.1, motes), t < 17.5 ? charge : 0, this.tip);

    const cracks = Math.max(seg(t, 4.5, 7) * 0.35 * (1 - seg(t, 8, 9)), charge * 1.1) * (1 - seg(t, 19, 24));
    this.world.cracks.opacity = cracks;
    this.world.cracks.color.setRGB(0.7 + charge * 1.6, 0.2, 1.4 - charge * 0.6);

    // ---------------- the charge ----------------
    const pillar = smooth(seg(t, 13.8, 15)) * (1 - seg(t, 17.5, 18.1));
    fx.setPillar(pillar, smooth(seg(t, 15.5, 17.3)), this.kPos, t > 14.5 && t < 17.5, this.tip, dt);
    k.bladeGlow.opacity = t < 9 ? seg(t, 5.5, 7) * 0.2 : t < 13.5 ? 0.3 : t < 17.5 ? 0.3 + charge * 0.4 : 0.6 * (1 - seg(t, 18.6, 20));
    fx.swordLight.position.copy(this.tip);
    fx.swordLight.intensity = k.bladeGlow.opacity * 60;

    // ---------------- the beam ----------------
    this.v.set(this.gPos.x - this.kPos.x, 0, this.gPos.z - this.kPos.z).normalize();
    this.beamFrom.copy(this.kPos).addScaledVector(this.v, 1.2).setY(1.1);
    this.beamTo.copy(GIANT_STAND).setY(2.8).addScaledVector(this.v, 6);
    const reach = outCubic(seg(t, 17.6, 18.05));
    const beamAmt = t >= 17.6 && t < 19.2 ? 1 - seg(t, 18.7, 19.15) : 0;
    fx.setBeam(this.beamFrom, this.beamTo, reach, beamAmt);
    this.world.trench.opacity = seg(t, 17.8, 18.3) * (1 - seg(t, 21, 30));

    // ---------------- the flash and the cut to black ----------------
    if (t >= 19 && t < 19.9) {
      this.flashBlack = true;
      this.flash = 1 - seg(t, 19.4, 19.9);
    } else {
      this.flashBlack = false;
      this.flash = seg(t, 17.6, 17.66) * (1 - seg(t, 17.68, 17.95)) * 0.75 + seg(t, 9.6, 9.62) * (1 - seg(t, 9.62, 9.8)) * 0.3;
    }

    // ---------------- the blast ----------------
    const blastAt = this.blastAt;
    const blastGrow = outCubic(seg(t, 19.4, 21));
    const blastFade = t >= 19.4 ? 1 - smooth(seg(t, 21, 24.5)) : 0;
    const smoke = t >= 19.6 ? smooth(seg(t, 19.6, 21)) * (1 - smooth(seg(t, 23, 28))) : 0;
    fx.setBlast(blastGrow, blastFade, smoke);

    // ---------------- the mood: fog, sky, embers ----------------
    const boom = blastFade;
    this.fog.copy(FOG_BASE).lerp(new THREE.Color(0x2c0a3c), Math.max(grow * 0.4, charge)).lerp(new THREE.Color(0x3a1206), boom * 0.45);
    this.world.fog.color.copy(this.fog);
    this.world.fog.density = 0.013 + charge * 0.004 - boom * 0.004;
    this.world.skyUniforms.uTintAmt.value = charge * 0.2 + boom * 0.18;
    this.world.skyUniforms.uTint.value.setRGB(0.35 + boom * 0.6, 0.06 + boom * 0.2, 0.6 - boom * 0.5);
    fx.setEmbers(1 + boom * 2.5 + charge * 0.5, Math.max(boom, charge * 0.6));

    // ---------------- shake ----------------
    let shake = charge * 0.18;
    if (t > 17.6 && t < 19) shake = 0.7;
    if (t >= 19.4) shake = Math.max(shake, 1.2 * (1 - seg(t, 19.4, 21.5)));
    if (t > 8 && t < 9.6) shake = Math.max(shake, 0.12); // his footfalls
    for (const x of EXCHANGES) shake = Math.max(shake, (x === 9.6 ? 0.8 : 0.4) * (1 - seg(t, x, x + 0.35)) * (t >= x ? 1 : 0));
    this.shake = shake;
    this.shakeAt.copy(t >= 19.4 ? GIANT_STAND : t > 13 ? this.kPos : CLASH_AT);

    // ---------------- one-off moments ----------------
    if (this.crossed(4)) this.onCue('shadow', this.kPos);
    if (this.crossed(6.3)) this.onCue('roar', this.gPos);
    if (this.crossed(8)) this.onCue('charge-run', this.gPos);
    if (this.crossed(9)) this.onCue('dash', this.kPos);
    for (const x of EXCHANGES) {
      if (!this.crossed(x)) continue;
      const at = this.v.copy(this.kPos).lerp(this.gPos, 0.35).setY(1.7);
      fx.clash(at, x === 9.6);
      this.onCue(x === 9.6 ? 'clash-big' : 'clash', at);
    }
    if (this.crossed(12.2)) this.onCue('leap', this.kPos);
    if (this.crossed(13.6)) this.onCue('charge', this.kPos);
    if (this.crossed(17.55)) {
      this.onCue('release', this.kPos);
      fx.wave(new THREE.Vector3(this.kPos.x, 0.05, this.kPos.z), 30, 1, [2.2, 0.4, 3.2]);
      fx.sparkBurst(this.tip, 200, 18, [3, 0.4, 4], [4, 0.3, 0.5], 0.2);
    }
    if (this.crossed(18.05)) fx.sparkBurst(blastAt, 250, 24, [4, 3, 4], [3, 0.3, 1.2], 0.3);
    if (this.crossed(19)) this.onCue('black', blastAt);
    if (this.crossed(19.4)) {
      fx.explode(blastAt);
      this.onCue('impact', blastAt);
    }
    if (this.crossed(19.75)) fx.wave(new THREE.Vector3(blastAt.x, 0.1, blastAt.z), 45, 1.3, [3.5, 0.5, 0.8]);
    for (const [at, rgb] of [
      [20.4, [3.5, 0.3, 0.5]],
      [21.1, [2, 0.5, 3.6]],
      [21.8, [4, 3, 3.6]],
      [22.5, [3.2, 0.25, 0.6]],
    ] as const) {
      if (!this.crossed(at)) continue;
      fx.ring(this.v.copy(GIANT_STAND).setY(4 + (at - 20.4) * 4), [...rgb] as [number, number, number]);
      this.onCue('ring', GIANT_STAND);
    }
    if (this.crossed(28.5)) {
      fx.sparkBurst(this.v.copy(GIANT_HOME).setY(1), 120, 8, [3, 0.2, 0.3], [1.4, 0.2, 2.6], -0.1);
      this.onCue('reform', GIANT_HOME);
    }

    fx.update(dt, clock);
  }

  private knightPos(t: number, out: THREE.Vector3): THREE.Vector3 {
    const meet = new THREE.Vector3(0, 0, -1.8);
    if (t < 9) return out.copy(KNIGHT_HOME);
    if (t < 9.6) return out.lerpVectors(KNIGHT_HOME, meet, smooth(seg(t, 9, 9.6)));
    const fight = (x: number): THREE.Vector3 => new THREE.Vector3(Math.sin((x - 9.6) * 2.4) * 1.2, 0, -1.8 + Math.sin((x - 9.6) * 3.1) * 0.6);
    if (t < 12.2) return out.copy(fight(t));
    if (t < 12.9) {
      const p = seg(t, 12.2, 12.9);
      out.lerpVectors(fight(12.2), KNIGHT_HOME, outCubic(p));
      out.y = Math.sin(p * Math.PI) * 3.2;
      return out;
    }
    return out.copy(KNIGHT_HOME);
  }

  private giantPos(t: number, out: THREE.Vector3): THREE.Vector3 {
    const meet = new THREE.Vector3(0, 0, -6.4);
    if (t >= 28.5 || t < 8) return out.copy(GIANT_HOME);
    if (t < 9.6) return out.lerpVectors(GIANT_HOME, meet, Math.pow(seg(t, 8, 9.6), 1.2));
    const fight = (x: number): THREE.Vector3 => new THREE.Vector3(-Math.sin((x - 9.6) * 2.4) * 0.9, 0, -6.4 - Math.max(0, Math.sin((x - 9.6) * 3.1)) * 0.5);
    if (t < 12.2) return out.copy(fight(t));
    if (t < 13.6) return out.lerpVectors(fight(12.2), GIANT_STAND, outCubic(seg(t, 12.2, 13.6)));
    return out.copy(GIANT_STAND);
  }

  /**
   * Film mode: the camera the scene would have in the movie - one shot per beat, hard cuts between them.
   */
  film(cam: THREE.PerspectiveCamera): void {
    const t = this.t;
    const k = this.kPos;
    const look = this.v;
    let fov = 50;
    if (t < 4) {
      const a = 0.9 + t * 0.12;
      cam.position.set(k.x + Math.sin(a) * 6.5, 1.6, k.z + Math.cos(a) * 6.5);
      look.set(k.x, 1.2, k.z);
    } else if (t < 8) {
      const p = seg(t, 4, 8);
      cam.position.set(k.x + 2.2 - p * 0.6, 0.35, k.z - 3.2 + p * 0.8);
      look.set(k.x, 1.5, k.z);
      fov = 42;
    } else if (t < 9.6) {
      const p = seg(t, 8, 9.6);
      cam.position.set(15, 2.6, THREE.MathUtils.lerp(6, -2, p));
      look.set(0, 2.2, THREE.MathUtils.lerp(-6, -4, p));
    } else if (t < 12.2) {
      const p = seg(t, 9.6, 12.2);
      cam.position.set(7.5 + Math.sin(p * 3) * 1, 1.4 + p, -1 + p * 2);
      look.set(0, 2, -4);
      fov = 46;
    } else if (t < 13.6) {
      cam.position.set(18, 7, 4);
      look.set(0, 2, -4);
      fov = 55;
    } else if (t < 17.5) {
      const p = seg(t, 13.6, 17.5);
      cam.position.set(k.x + 2.6 - p * 1.2, 0.4 + p * 0.3, k.z - 6.5 + p * 2.8);
      look.set(k.x, 2.2 + p * 1.5, k.z);
      fov = 58 - p * 10;
    } else if (t < 19) {
      cam.position.set(k.x + 5, 3.4, k.z + 9);
      look.set(0, 2.2, GIANT_STAND.z);
      fov = 62;
    } else if (t < 24) {
      const p = seg(t, 19, 24);
      cam.position.set(46 - p * 4, 12 + p * 2, -2);
      look.set(0, 7, GIANT_STAND.z);
      fov = 60;
    } else {
      const a = 0.6 + seg(t, 24, 32) * 1.4;
      cam.position.set(Math.sin(a) * 26, 5, Math.cos(a) * 26 + 2);
      look.set(k.x, 1.5, k.z);
      fov = 50;
    }
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(look);
  }
}
