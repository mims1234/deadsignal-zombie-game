/**
 * Excalibur v2: the scene, start to end, on an 88-second loop. One clock drives the figures, the effects, the
 * destruction, the sound and the film camera, so nothing can drift apart.
 *
 * ACT I    0     STANDOFF     she stands with her sword planted; darkness stirs; he roars
 * ACT II   9     THE FIGHT    the charge and a circling exchange; his ground slam, her dodge and a strike out of
 *                             the sky; a shockwave she leaps; a blitz from every side; he swats her across the
 *                             courtyard; "not yet"; blades locked until she breaks it; he goes berserk
 * ACT III  40    THE CHARGE   kamae; darkness pours in from the whole courtyard; the rubble lifts; he charges and her
 *                             pressure throws him back; the blade goes overhead, a column of light, lightning, a
 *                             blade of light growing out of the steel; a heartbeat; "Exxx..."
 * ACT IV   59.6  EXCALIBUR    "CALIBUR!" - the beam holds on him for four seconds, swelling; his slab glows white and
 *                             breaks; it goes through him
 * ACT V    64    THE BLAST    white as a nuke, slowly coming back to a courtyard in ruins: the ground torn open
 *                             along the beam's path into a molten crater, fire, smoke, pillars thrown down;
 *                             "it is over"; the camera rises over the ruins and the picture fades to black (looping,
 *                             the next run fades in from black, so the world is never seen putting itself back)
 */
import * as THREE from 'three';
import { easePose, Giant, GIANT_POSES, type GiantPose, Knight, KNIGHT_POSES, type KnightPose } from './actors';
import type { Fx } from './fx';
import { BLAST_AT, type Ruin } from './ruin';
import { FOG_BASE, GIANT_STAND, KNIGHT_HOME, type World } from './world';

export const LOOP = 88;
/** Where the scene stops when it is not looping: the ruins, quiet. */
export const END_HOLD = 80;

export const PHASES: [number, string][] = [
  [0, 'Standoff'],
  [9, 'The fight'],
  [27.3, 'Not yet'],
  [31.4, 'Blades locked'],
  [36.8, 'Berserk'],
  [40, 'The charge'],
  [50, 'Excalibur'],
  [64, 'The blast'],
  [70, 'Ruins'],
];

/** Moments the sound hangs off. */
export type Cue =
  | 'shadow'
  | 'roar'
  | 'charge-run'
  | 'dash'
  | 'clash'
  | 'clash-big'
  | 'slam'
  | 'leap'
  | 'flung'
  | 'lock'
  | 'break'
  | 'berserk'
  | 'gather'
  | 'barrier'
  | 'charge'
  | 'heartbeat'
  | 'release'
  | 'shatter'
  | 'impact'
  | 'ring'
  | 'loop';

type KPose = keyof typeof KNIGHT_POSES;
type GPose = keyof typeof GIANT_POSES;

/** A track key: from `t` the figure holds `pose`, and travels (eased) towards the next key's spot. */
interface Key<P> {
  t: number;
  x: number;
  z: number;
  pose: P;
  rate: number;
  /** hop height on the way in to this key */
  arc: number;
  /** running from this key on */
  run: number;
}

const k = <P>(t: number, x: number, z: number, pose: P, rate: number, arc = 0, run = 0): Key<P> => ({ t, x, z, pose, rate, arc, run });

const BLITZ: [number, number, number, KPose][] = [
  [21.35, 0, -6.8, 'slashA'],
  [22.4, 3.4, -10, 'slashB'],
  [23.4, 0, -13.4, 'slashA'],
  [24.3, -3.4, -10, 'slashB'],
  [25.0, 2.4, -7.6, 'slashA'],
  [25.6, -2.4, -12.4, 'slashB'],
  [26.2, 0, -6.8, 'spin'],
];
const EXCHANGES = [10.0, 10.6, 11.2, 11.8, 12.4, 13.0, 13.6];

function knightTrack(): Key<KPose>[] {
  const keys: Key<KPose>[] = [
    k(0, 0, 14, 'idle', 3),
    k(8.6, 0, 14, 'guard', 4),
    k(9.4, 0, 14, 'dash', 12, 0, 1),
    k(10.0, 0, -2.2, 'slashA', 16),
    k(10.6, 1.8, -3.4, 'slashB', 16),
    k(11.2, 2.9, -6.4, 'slashA', 16),
    k(11.8, 1.4, -9.3, 'slashB', 16),
    k(12.4, -1.6, -9.4, 'slashA', 16),
    k(13.0, -2.9, -6.5, 'slashB', 16),
    k(13.6, -1.4, -3.4, 'slashA', 16),
    k(14.4, -1.0, -2.6, 'guard', 6),
    k(15.85, -1.0, -2.6, 'dash', 14),
    k(16.1, 4.6, -1.6, 'crouch', 10),
    k(16.9, 4.6, -1.6, 'aerial', 10),
    k(17.65, 1.0, -5.0, 'release', 18, 6.5),
    k(18.4, 0.5, 3.0, 'guard', 8),
    k(20.05, 0.5, 3.0, 'crouch', 10),
    k(20.6, 0.5, 3.0, 'guard', 8, 1.8),
    k(21.05, 0.5, 3.0, 'dash', 16, 0, 1),
  ];
  BLITZ.forEach(([t, x, z, pose], i) => {
    keys.push(k(t, x, z, pose, 18));
    const next = BLITZ[i + 1];
    if (next) keys.push(k(next[0] - 0.28, x, z, 'dash', 18));
  });
  keys.push(
    k(27.35, 0, -6.8, 'guard', 8),
    k(28.25, 0, 8, 'flung', 10, 2.4),
    k(29.0, 0, 11, 'crouch', 6),
    k(30.3, 0, 11, 'guard', 2.5),
    k(30.8, 0, 11, 'dash', 14, 0, 1),
    k(31.4, 0, -2.8, 'lock', 10),
    k(35.0, 0, -3.2, 'spin', 18),
    k(35.7, 0, -2.5, 'guard', 5),
    k(37.9, 0, -2.5, 'crouch', 10),
    k(38.9, 0, 14, 'guard', 6, 5.5),
    k(40.0, 0, 14, 'kamae', 2),
    k(50.0, 0, 14, 'overhead', 1.1),
    k(59.85, 0, 14, 'release', 20),
    k(70.0, 0, 14, 'idle', 1.2),
  );
  return keys;
}

function giantTrack(): Key<GPose>[] {
  const keys: Key<GPose>[] = [k(0, 0, -26, 'idle', 3), k(7.3, 0, -26, 'roar', 5), k(9.0, 0, -26, 'charge', 6, 0, 1), k(10.0, 0, -6.4, 'raised', 12)];
  EXCHANGES.slice(1).forEach((t, i) => keys.push(k(t, 0, -6.4, i % 2 ? 'raised' : 'cleave', 12)));
  keys.push(
    k(14.4, 0, -6.4, 'block', 6),
    k(15.3, 0, -6.4, 'slamUp', 8),
    k(16.0, -0.4, -4.8, 'slamDown', 18),
    k(16.9, 0, -6.0, 'block', 6),
    k(18.4, 0, -10, 'stagger', 6),
    k(19.0, 0, -10, 'roar', 5),
    k(19.6, 0, -10, 'slamUp', 8),
    k(20.05, 0, -10, 'slamDown', 18),
    k(20.9, 0, -10, 'block', 5),
  );
  BLITZ.forEach(([t], i) => keys.push(k(t, 0, -10, i % 2 ? 'struck' : 'stagger', 12)));
  keys.push(
    k(26.6, 0, -10, 'roar', 6),
    k(27.1, 0, -9.2, 'backhand', 14),
    k(28.0, 0, -9.2, 'idle', 4),
    k(30.8, 0, -9.2, 'charge', 6, 0, 1),
    k(31.4, 0, -6.9, 'press', 10),
    k(35.0, 0, -6.9, 'press', 10),
    k(35.7, 0, -15, 'struck', 8),
    k(36.1, 0, -15, 'kneel', 6),
    k(37.0, 0, -15, 'roar', 4),
    k(37.4, 0, -15, 'charge', 6, 0, 1),
    k(38.9, 0, -3.5, 'cleave', 14),
    k(39.6, 0, -3.5, 'stagger', 4),
    k(40.5, 0, -3.5, 'idle', 3),
    k(47.5, 0, -3.5, 'charge', 5, 0, 1),
    k(48.9, 0, 4.5, 'press', 10),
    k(49.1, 0, 4.5, 'press', 10),
    k(50.6, 0, -18, 'stagger', 6),
    k(51.3, 0, -18, 'brace', 3),
    k(59.9, 0, -18, 'block', 10),
    k(62.2, 0, -18, 'struck', 8),
  );
  return keys;
}

const KNIGHT_KEYS = knightTrack();
const GIANT_KEYS = giantTrack();

const seg = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number): number => x * x * (3 - 2 * x);
const outCubic = (x: number): number => 1 - Math.pow(1 - x, 3);

/** Where a track puts its figure at `t`, and the key in force. */
function sample<P>(keys: Key<P>[], t: number, out: THREE.Vector3): Key<P> {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  if (!b || (a.x === b.x && a.z === b.z && !b.arc)) {
    out.set(a.x, 0, a.z);
    return a;
  }
  const u = seg(t, a.t, b.t);
  const e = smooth(u);
  out.set(a.x + (b.x - a.x) * e, Math.sin(u * Math.PI) * b.arc, a.z + (b.z - a.z) * e);
  return a;
}

/** A one-off, decaying kick of camera shake. */
interface Kick {
  at: number;
  amp: number;
  dur: number;
}

export class Director {
  t = 0;
  /** keep replaying (otherwise hold on the ruins at END_HOLD) */
  loop = true;
  /** held at the end */
  held = false;
  shake = 0;
  readonly shakeAt = new THREE.Vector3();
  /** full-screen flash strength, and whether it is the white of the blast or the black of the ending (else a pink pop) */
  flash = 0;
  flashWhite = false;
  flashBlack = false;
  /** exposure multiplier: the world blown out after the blast, coming back slowly */
  exposure = 1;
  onCue: (cue: Cue, at: THREE.Vector3) => void = () => {};

  private prev = 0;
  private kicks: Kick[] = [];
  private readonly kPos = new THREE.Vector3();
  private readonly gPos = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly beamFrom = new THREE.Vector3();
  private readonly beamTo = new THREE.Vector3();
  private readonly slabAt = new THREE.Vector3();
  private readonly fog = new THREE.Color();
  private readonly blastAt = GIANT_STAND.clone().setY(2.5);
  /** where she was last frame, for the trail she leaves when she moves fast */
  private readonly kPrev = new THREE.Vector3();
  private kPrevOk = false;

  constructor(
    private readonly knight: Knight,
    private readonly giant: Giant,
    private readonly fx: Fx,
    private readonly world: World,
    private readonly ruin: Ruin,
  ) {}

  restart(): void {
    this.t = 0;
    this.prev = 0;
    this.held = false;
    this.kicks = [];
    this.kPrevOk = false;
    this.fx.reset();
    this.giant.slab.visible = true;
    this.onCue('loop', KNIGHT_HOME);
  }

  phase(): string {
    if (this.held) return 'The ruins';
    let name = PHASES[0][1];
    for (const [at, n] of PHASES) if (this.t >= at) name = n;
    return name;
  }

  private crossed(at: number): boolean {
    return this.prev < at && this.t >= at;
  }

  private kick(amp: number, dur: number): void {
    this.kicks.push({ at: this.t, amp, dur });
  }

  update(dt: number, clock: number): void {
    this.prev = this.t;
    if (!this.loop && this.t >= END_HOLD) {
      this.held = true;
      this.t = END_HOLD;
      this.prev = END_HOLD;
    } else {
      this.held = false;
      this.t += dt;
      if (this.t >= LOOP) {
        this.restart();
        this.t = 0;
      }
    }
    const t = this.t;
    const kn = this.knight;
    const g = this.giant;
    const fx = this.fx;

    // ---------------- tracks ----------------
    const kk = sample(KNIGHT_KEYS, t, this.kPos);
    const gk = sample(GIANT_KEYS, t, this.gPos);
    // blades locked: both shoved back and forth, then she drives him back
    if (t >= 31.4 && t < 35) {
      const push = Math.sin(t * 6.3) * 0.25 + Math.sin(t * 13.1) * 0.08 - seg(t, 33.4, 34.6) * 0.5;
      this.kPos.z += push;
      this.gPos.z += push;
    }
    kn.root.position.copy(this.kPos);
    g.root.position.copy(this.gPos);
    // fast enough, and she leaves a streak of violet behind her (not for the jump of a replay)
    if (this.kPrevOk && dt > 0) {
      const d = this.kPrev.distanceTo(this.kPos);
      if (d / dt > 4.5 && d < 4) fx.trail(this.kPrev, this.kPos);
    }
    this.kPrev.copy(this.kPos);
    this.kPrevOk = true;
    fx.keepClear(this.kPos);
    const gone = t >= 62.3;
    kn.root.rotation.y = gone ? Math.PI : Math.atan2(this.gPos.x - this.kPos.x, this.gPos.z - this.kPos.z);
    g.root.rotation.y = Math.atan2(this.kPos.x - this.gPos.x, this.kPos.z - this.gPos.z);
    kn.stride = kk.run;
    g.stride = gk.run;
    easePose(kn.pose, KNIGHT_POSES[kk.pose] as KnightPose, kk.rate, dt);
    easePose(g.pose, GIANT_POSES[gk.pose] as GiantPose, gk.rate, dt);

    // he is unmade by the beam
    g.root.visible = !gone;
    const rage = t < 7.3 ? 0.3 : t < 36.8 ? 0.8 : 1.2;
    g.eyes.color.setRGB(1 + rage * 3.5, 0.15 + rage * 0.15, 0.1);
    const burning = seg(t, 60.3, 62.2);
    g.skin.emissive.setRGB(burning * 1.2, burning * 0.5, burning * 0.8);
    g.slabEdge.color.setRGB(1.6 + burning * 3, 0.2 + burning * 3, 0.1 + burning * 3);

    kn.update(dt, clock);
    g.update(dt, clock);
    kn.tip.getWorldPosition(this.tip);
    const contact = this.w.copy(this.kPos).lerp(this.gPos, 0.42).setY(1.8);

    // ---------------- the shadow: dark streams, motes drawn from the whole courtyard ----------------
    const charge = seg(t, 40, 59.6);
    const stand = 0.55 * smooth(seg(t, 4.5, 8)) * (1 - smooth(seg(t, 9.4, 11)));
    const gather = smooth(seg(t, 40, 44.5)) * (1 - 0.85 * smooth(seg(t, 59.7, 60.3))) * (1 - smooth(seg(t, 64, 69)));
    const streams = Math.max(stand, gather);
    const suck = t < 59.7 ? smooth(seg(t, 42, 59.4)) : t < 60.3 ? 1 - seg(t, 59.7, 60.3) : 0;
    const motes = t < 40 ? 0.15 + stand * 0.6 : t < 60 ? 0.3 + smooth(seg(t, 40, 44)) * 0.8 : 0.12 * (1 - seg(t, 60, 62)) + seg(t, 70, 76) * 0.15;
    fx.setShadow(streams, Math.max(charge, 0.2), motes, suck, this.tip);

    // ---------------- auras ----------------
    const lockGlow = seg(t, 31.4, 33.5) * (1 - seg(t, 35.2, 36));
    const chargeGlow = smooth(seg(t, 40, 44)) * 0.6 + seg(t, 50, 57) * 0.5;
    // after it is over she keeps a quieter aura, red and violet, that never quite goes out
    const after = smooth(seg(t, 66, 70));
    const kAura = Math.max(lockGlow * 0.8, t >= 40 ? chargeGlow * (1 - seg(t, 60.3, 66)) : 0, after * 0.5);
    // red creeps in as she names the blade, burns through the beam, then settles to a share of the glow
    const callRed = t < 64 ? smooth(seg(t, 56, 59.8)) : 1 - after * 0.5;
    const kFlare = Math.max(t > 33.6 && t < 34.3 ? 1 : 0, seg(t, 57, 59.8) * (t < 62 ? 1 : 0));
    // once it is over: only a few slow motes rising off her
    fx.knightAura.set(kAura, this.kPos, kFlare, t >= 50 ? callRed * 0.7 : 0.1, 1 - after * 0.88, 1 - after * 0.72);
    // and on the ground: rings spreading from her feet, quicker as the charge builds
    // (the rings belong to the fight: once it is over they stop)
    fx.ripples.set(t < 66 ? Math.min(1, kAura * 1.4) * (1 - after) : 0, this.kPos, 1 + seg(t, 44, 59.5) * 1.8 + kFlare, t >= 50 ? callRed : 0);
    // the mark she leaves: it burns into the ground through the charge and stays when it is over
    fx.sigil.set(Math.max(seg(t, 44, 52) * 0.3, t >= 59.8 ? Math.max(1 - seg(t, 60, 68) * 0.6, after * 0.4) : 0), this.kPos, t >= 50 ? Math.max(callRed, after) : 0);
    const berserk = t >= 36.8 && t < 62.3 ? smooth(seg(t, 36.8, 37.6)) : 0;
    fx.giantAura.set(berserk, this.gPos, t > 47.5 && t < 49.2 ? 1 : seg(t, 60.2, 62.2));

    // ---------------- the ground: cracks spreading out from her ----------------
    const cracks = Math.max(stand * 0.6, seg(t, 44, 52) * 1.2 + seg(t, 58.4, 60) * 0.2) * (1 - seg(t, 64, 72));
    this.world.cracks.opacity = cracks;
    // violet as she charges; as she calls the blade, deep red, then bright red through the beam
    const deep = smooth(seg(t, 56, 58.4));
    const bright = smooth(seg(t, 58.4, 60.4));
    this.world.cracks.color.setRGB(
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.7 + charge * 1.6, 1.0, deep), 2.4, bright),
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.2, 0.0, deep), 0.1, bright),
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.4 - charge * 0.6, 0.04, deep), 0.06, bright),
    );
    this.world.crackMesh.scale.setScalar(t < 40 ? 0.6 : 0.35 + smooth(seg(t, 44, 56)) * 1.1);

    // ---------------- the charge ----------------
    fx.levitate.set(smooth(seg(t, 44, 50)), smooth(seg(t, 55, 59.5)));
    const pillar = smooth(seg(t, 50.5, 52.5)) * (1 - seg(t, 59.9, 60.6));
    fx.setPillar(pillar, smooth(seg(t, 55, 59.5)), this.kPos, t > 51.5 && t < 59.85, this.tip, dt);
    const bladeLen = 18 * smooth(seg(t, 52.5, 57.5)) * (1 - seg(t, 60.2, 61.2));
    const bladeAmt = smooth(seg(t, 52.5, 54)) * (1 - seg(t, 60.3, 61.2)) * (0.85 + 0.15 * Math.sin(clock * 22));
    kn.setLightBlade(bladeLen, bladeAmt, clock);
    kn.bladeGlow.opacity = t < 9 ? seg(t, 5.5, 7) * 0.2 : t < 40 ? 0.3 : t < 60 ? 0.3 + charge * 0.4 : 0.6 * (1 - seg(t, 62, 64));
    fx.swordLight.position.copy(this.tip);
    fx.swordLight.intensity = kn.bladeGlow.opacity * 60 + bladeAmt * 80;

    // ---------------- the beam: four seconds on him, swelling ----------------
    this.v.set(this.gPos.x - this.kPos.x, 0, this.gPos.z - this.kPos.z).normalize();
    if (gone) this.v.set(0, 0, -1);
    this.beamFrom.copy(this.kPos).addScaledVector(this.v, 1.2).setY(1.1);
    const through = smooth(seg(t, 62.2, 62.8));
    this.beamTo.copy(GIANT_STAND).setY(2.8).addScaledVector(this.v, -1.5 + through * 40);
    const reach = outCubic(seg(t, 60.0, 60.35));
    const beamOn = t >= 60 && t < 64.2;
    const swell = 1 + seg(t, 60.3, 63.8) * 0.9;
    fx.setBeam(this.beamFrom, this.beamTo, reach, beamOn ? 1 - seg(t, 63.9, 64.2) : 0, swell);
    this.world.trench.opacity = t < BLAST_AT ? seg(t, 60.2, 60.8) : 0;
    g.slab.getWorldPosition(this.slabAt);
    if (t > 60.35 && t < 62.2) fx.sparkBurst(this.slabAt.setY(2.6), 6, 14, [4, 3, 3.6], [3.2, 0.4, 1.2], 0.3);

    // ---------------- flashes: a pop on the swing, then the blast, white as a nuke, fading slowly ----------------
    this.flashBlack = false;
    if (t >= 84 || t < 1.5) {
      // the ending: fade to black, and the next run fades back in
      this.flashWhite = false;
      this.flashBlack = true;
      this.exposure = 1;
      this.flash = t >= 84 ? smooth(seg(t, 84, 87.2)) : 1 - smooth(seg(t, 0, 1.5));
    } else if (t >= 63.3 && t < 76) {
      this.flashWhite = true;
      const rise = seg(t, 63.3, 64.0);
      const fall = t < 65 ? 1 : Math.pow(1 - seg(t, 65, 72), 1.6);
      this.flash = Math.min(rise * 0.75 + (t >= 64 ? 1 : 0), 1) * fall;
      this.exposure = 1 + (t >= 64 ? 3.2 * Math.pow(1 - seg(t, 64, 76), 2) : 0);
    } else {
      this.flashWhite = false;
      this.exposure = 1;
      this.flash =
        seg(t, 59.95, 60.0) * (1 - seg(t, 60.02, 60.3)) * 0.6 +
        seg(t, 62.2, 62.25) * (1 - seg(t, 62.25, 62.6)) * 0.5 +
        seg(t, 10.0, 10.02) * (1 - seg(t, 10.02, 10.2)) * 0.3 +
        seg(t, 17.65, 17.67) * (1 - seg(t, 17.67, 17.9)) * 0.3;
    }

    // ---------------- the blast and what it leaves ----------------
    const blastGrow = outCubic(seg(t, BLAST_AT, BLAST_AT + 2.4));
    const blastFade = t >= BLAST_AT ? 1 - smooth(seg(t, BLAST_AT + 2.5, BLAST_AT + 7)) : 0;
    const smoke = t >= BLAST_AT + 0.4 ? smooth(seg(t, BLAST_AT + 0.4, BLAST_AT + 2.5)) * (1 - smooth(seg(t, BLAST_AT + 6, BLAST_AT + 12))) : 0;
    fx.setBlast(blastGrow * 1.5, blastFade, smoke);
    this.ruin.apply(t);

    // ---------------- the mood ----------------
    const boom = t >= BLAST_AT ? 1 - seg(t, BLAST_AT + 6, BLAST_AT + 20) * 0.7 : 0;
    this.fog.copy(FOG_BASE).lerp(new THREE.Color(0x2c0a3c), Math.max(stand * 0.4, t < 60 ? charge : 0)).lerp(new THREE.Color(0x3a1206), boom * 0.5);
    this.world.fog.color.copy(this.fog);
    this.world.fog.density = 0.013 + (t < 60 ? charge * 0.004 : 0) + (t >= BLAST_AT ? 0.004 * boom : 0);
    this.world.skyUniforms.uTintAmt.value = (t < 60 ? charge * 0.25 : 0) + boom * 0.2;
    this.world.skyUniforms.uTint.value.setRGB(0.35 + boom * 0.6, 0.06 + boom * 0.2, 0.6 - boom * 0.5);
    fx.setEmbers(1 + boom * 2.5 + charge * 0.6, Math.max(boom, charge * 0.6));

    // ---------------- shake ----------------
    let shake = 0;
    if (t > 8 && t < 10) shake = 0.12;
    if (t > 31.4 && t < 35) shake = 0.18;
    if (t > 44 && t < 59.8) shake = seg(t, 44, 59.5) * 0.3;
    if (t > 60 && t < 64) shake = 0.5 + seg(t, 60, 64) * 0.7;
    this.kicks = this.kicks.filter((x) => t - x.at < x.dur && t >= x.at);
    for (const x of this.kicks) shake = Math.max(shake, x.amp * (1 - (t - x.at) / x.dur));
    this.shake = shake;
    this.shakeAt.copy(t >= BLAST_AT ? GIANT_STAND : t > 40 ? this.kPos : contact);

    this.events(t, contact);
    fx.update(dt, clock);
  }

  /** One-off moments. */
  private events(t: number, contact: THREE.Vector3): void {
    const fx = this.fx;
    const violet: [number, number, number] = [1.4, 0.4, 3.6];
    const red: [number, number, number] = [3.4, 0.3, 0.5];

    if (this.crossed(4.5)) this.onCue('shadow', this.kPos);
    if (this.crossed(7.3)) {
      this.onCue('roar', this.gPos);
      fx.wave(this.v.copy(this.gPos).setY(0.05), 14, 0.9, [3, 0.4, 0.3]);
      this.kick(0.25, 1.2);
    }
    if (this.crossed(9.0)) this.onCue('charge-run', this.gPos);
    if (this.crossed(9.4)) this.onCue('dash', this.kPos);

    // the circling exchange
    EXCHANGES.forEach((x, i) => {
      if (!this.crossed(x)) return;
      fx.clash(contact, i === 0);
      if (i === 0) fx.streak(KNIGHT_HOME, this.kPos, violet);
      this.onCue(i === 0 ? 'clash-big' : 'clash', contact);
      this.kick(i === 0 ? 0.8 : 0.4, 0.35);
    });

    // his ground slam; her dodge; the strike out of the sky
    if (this.crossed(16.0)) {
      const at = this.v.copy(this.gPos).add(new THREE.Vector3(0, 0, 1.8)).setY(0.1);
      fx.wave(at, 22, 0.9, [3.2, 0.8, 0.3]);
      fx.rubble(at, 0.45);
      fx.sparkBurst(at, 160, 14, [4, 2.4, 0.8], [3, 0.5, 0.2], 0.6);
      this.onCue('slam', at);
      this.kick(0.9, 0.7);
    }
    if (this.crossed(16.1)) fx.streak(new THREE.Vector3(-1, 0, -2.6), this.kPos, violet);
    if (this.crossed(16.9)) this.onCue('leap', this.kPos);
    if (this.crossed(17.65)) {
      const at = this.v.copy(contact).setY(3.4);
      fx.clash(at, true);
      fx.wave(this.w.copy(at).setY(0.06), 24, 1.0, violet);
      this.onCue('clash-big', at);
      this.kick(1.0, 0.6);
    }
    // the shockwave she hops
    if (this.crossed(20.05)) {
      const at = this.v.copy(this.gPos).setY(0.1);
      fx.wave(at, 34, 1.3, [3.4, 0.6, 0.3]);
      fx.wave(at, 22, 0.9, [4, 2, 1]);
      fx.rubble(at, 0.35);
      this.onCue('slam', at);
      this.kick(1.0, 0.9);
    }
    if (this.crossed(21.05)) this.onCue('dash', this.kPos);

    // the blitz: from every side, a trail of light behind each dash
    BLITZ.forEach(([x], i) => {
      if (!this.crossed(x)) return;
      const from = i === 0 ? new THREE.Vector3(0.5, 0, 3) : new THREE.Vector3(BLITZ[i - 1][1], 0, BLITZ[i - 1][2]);
      fx.streak(from, this.kPos, i % 2 ? red : violet);
      fx.clash(contact, i === BLITZ.length - 1);
      this.onCue(i === BLITZ.length - 1 ? 'clash-big' : 'clash', contact);
      this.kick(i === BLITZ.length - 1 ? 0.8 : 0.45, 0.3);
    });
    if (this.crossed(26.6)) this.onCue('roar', this.gPos);

    // he swats her across the courtyard; she skids on her blade
    if (this.crossed(27.35)) {
      fx.clash(contact, true);
      this.onCue('flung', contact);
      this.kick(0.9, 0.6);
    }
    if (t > 28.25 && t < 29.0) fx.sparkBurst(this.v.copy(this.kPos).setY(0.15), 5, 6, [4, 2.6, 0.8], [3, 0.6, 0.2], 0.5);
    if (this.crossed(30.8)) this.onCue('dash', this.kPos);

    // blades locked: a fountain of sparks; her aura bursts; she breaks it
    if (this.crossed(31.4)) {
      fx.clash(contact, true);
      this.onCue('lock', contact);
      this.kick(0.8, 0.5);
    }
    if (t > 31.4 && t < 35) fx.sparkBurst(contact, 4, 9, [4, 3.4, 3.8], [3.4, 0.4, 0.8], 0.4);
    if (this.crossed(33.6)) {
      fx.wave(this.v.copy(this.kPos).setY(0.06), 18, 0.8, violet);
      fx.sparkBurst(this.v.copy(this.kPos).setY(1.2), 140, 10, violet, [2.6, 0.3, 0.5], 0);
    }
    if (this.crossed(35.0)) {
      fx.clash(contact, true);
      fx.wave(this.v.copy(contact).setY(0.06), 26, 1.0, violet);
      this.onCue('break', contact);
      this.kick(1.0, 0.7);
    }
    if (this.crossed(36.8)) {
      fx.wave(this.v.copy(this.gPos).setY(0.06), 20, 1.0, red);
      this.onCue('berserk', this.gPos);
      this.kick(0.6, 1.5);
    }
    if (this.crossed(38.9)) {
      const at = this.v.copy(this.gPos).add(new THREE.Vector3(0, 0, 2.2)).setY(0.1);
      fx.wave(at, 20, 0.8, [3.4, 0.6, 0.3]);
      fx.rubble(at, 0.35);
      this.onCue('slam', at);
      this.kick(0.7, 0.6);
    }

    // the charge
    if (this.crossed(40.0)) this.onCue('gather', this.kPos);
    if (this.crossed(48.9)) {
      fx.wave(this.v.copy(this.kPos).setY(0.06), 30, 1.2, violet);
      fx.ring(this.v.copy(this.kPos).add(new THREE.Vector3(0, 1.5, -4)), violet);
      fx.sparkBurst(this.v.copy(this.gPos).setY(2.5), 200, 14, violet, red, 0.2);
      this.onCue('barrier', this.kPos);
      this.kick(0.9, 0.8);
    }
    if (this.crossed(50.0)) this.onCue('charge', this.kPos);
    for (const hb of [54.0, 55.1, 56.3, 57.6, 58.9]) if (this.crossed(hb)) this.onCue('heartbeat', this.kPos);

    // Excalibur
    if (this.crossed(59.85)) {
      this.onCue('release', this.kPos);
      fx.wave(this.v.copy(this.kPos).setY(0.05), 40, 1.2, [3.6, 0.25, 0.3]);
      fx.wave(this.w.copy(this.kPos).setY(0.06), 28, 0.9, [2.2, 0.4, 3.2]);
      fx.sparkBurst(this.tip, 260, 20, [3, 0.4, 4], [4, 0.3, 0.5], 0.2);
    }
    for (let w = 60.5; w < 63.8; w += 0.55)
      if (this.crossed(w)) fx.wave(this.v.copy(this.kPos).setY(0.05), 22 + (w - 60) * 4, 0.8, w % 1.1 < 0.55 ? [3.4, 0.2, 0.25] : [1.6, 0.05, 0.1]);
    if (this.crossed(62.2)) {
      fx.shatter(this.slabAt);
      this.giant.slab.visible = false;
      this.onCue('shatter', this.slabAt);
    }
    if (this.crossed(BLAST_AT)) {
      fx.explode(this.blastAt);
      fx.levitate.drop();
      this.onCue('impact', this.blastAt);
      this.kick(1.4, 3.5);
    }
    if (this.crossed(BLAST_AT + 0.4)) fx.wave(this.v.copy(this.blastAt).setY(0.1), 90, 2.2, [3.5, 1.4, 0.5]);
    for (const [at, rgb] of [
      [65.2, [3.5, 0.3, 0.5]],
      [65.9, [2, 0.5, 3.6]],
      [66.6, [4, 3, 3.6]],
      [67.3, [3.2, 0.25, 0.6]],
    ] as const) {
      if (!this.crossed(at)) continue;
      fx.ring(this.v.copy(GIANT_STAND).setY(5 + (at - 65.2) * 5), [...rgb] as [number, number, number]);
      this.onCue('ring', GIANT_STAND);
    }
  }

  /** The film camera: one shot per beat, hard cuts between them, the way the movie would cut it. */
  film(cam: THREE.PerspectiveCamera): void {
    const t = this.t;
    let i = 0;
    while (i + 1 < SHOTS.length && SHOTS[i + 1].at <= t) i++;
    const shot = SHOTS[i];
    const p = seg(t, shot.at, SHOTS[i + 1]?.at ?? LOOP);
    const look = this.v;
    shot.set(p, cam.position, look, this.kPos, this.gPos);
    if (cam.fov !== shot.fov) {
      cam.fov = shot.fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(look);
  }
}

interface Shot {
  at: number;
  fov: number;
  set: (p: number, cam: THREE.Vector3, look: THREE.Vector3, k: THREE.Vector3, g: THREE.Vector3) => void;
}

const lerp = THREE.MathUtils.lerp;

const SHOTS: Shot[] = [
  // ACT I
  { at: 0, fov: 50, set: (p, c, l, k) => { const a = 0.9 + p * 0.6; c.set(k.x + Math.sin(a) * 6.5, 1.6, k.z + Math.cos(a) * 6.5); l.set(k.x, 1.2, k.z); } },
  { at: 4.5, fov: 42, set: (p, c, l, k) => { c.set(k.x + 2.2 - p * 0.6, 0.35, k.z - 3.2 + p * 0.8); l.set(k.x, 1.5, k.z); } },
  { at: 7.3, fov: 46, set: (p, c, l, _k, g) => { c.set(g.x + 3 - p, 1.0, g.z + 8); l.set(g.x, 4.2, g.z); } },
  // ACT II
  { at: 9.4, fov: 50, set: (p, c, l) => { c.set(15, 2.6, lerp(6, -2, p)); l.set(0, 2.2, lerp(-6, -4, p)); } },
  { at: 10.0, fov: 50, set: (_p, c, l, k, g) => { const a = Math.atan2(k.x - g.x, k.z - g.z) + 0.9; c.set(g.x + Math.sin(a) * 11, 3, g.z + Math.cos(a) * 11); l.set(g.x, 2.2, g.z); } },
  { at: 13.9, fov: 55, set: (p, c, l) => { c.set(14, 4, -4 + p * 2); l.set(0, 2, -4); } },
  { at: 16.9, fov: 58, set: (_p, c, l) => { c.set(6.5, 0.6, -0.5); l.set(1, 4, -5); } },
  { at: 18.4, fov: 52, set: (_p, c, l, k, g) => { c.set(k.x + 1.6, 2.2, k.z + 4); l.set(g.x, 3, g.z); } },
  { at: 21.0, fov: 55, set: (p, c, l) => { const a = p * 2.6; c.set(Math.sin(a) * 12, 7, -10 + Math.cos(a) * 12); l.set(0, 1.5, -10); } },
  { at: 27.0, fov: 50, set: (_p, c, l, k) => { c.set(12, 3, k.z); l.set(k.x, 1.2, k.z); } },
  { at: 29.0, fov: 40, set: (_p, c, l, k) => { c.set(k.x + 0.9, 1.3, k.z - 2.6); l.set(k.x, 1.1, k.z); } },
  { at: 31.4, fov: 46, set: (p, c, l, k, g) => { const m = (k.z + g.z) / 2; const a = 0.6 + p * 1.6; c.set(Math.sin(a) * 5.5, 2, m + Math.cos(a) * 5.5); l.set(0, 1.8, m); } },
  { at: 35.0, fov: 55, set: (_p, c, l) => { c.set(16, 5, -8); l.set(0, 2, -10); } },
  { at: 37.4, fov: 52, set: (_p, c, l, _k, g) => { c.set(2.5, 2.4, 6); l.set(g.x, 3, g.z); } },
  // ACT III
  { at: 40.0, fov: 44, set: (p, c, l, k) => { c.set(k.x + 0.3, 1.4, k.z - 6 + p * 2.2); l.set(k.x, 1.4, k.z); } },
  { at: 44.0, fov: 50, set: (p, c, l, k) => { c.set(25 - p * 4, 2.2 + p * 1.5, k.z - 9); l.set(k.x, 3, k.z); } },
  { at: 47.5, fov: 55, set: (_p, c, l, k, g) => { c.set(7, 3.5, (k.z + g.z) / 2 - 6); l.set(0, 2.5, (k.z + g.z) / 2); } },
  { at: 50.6, fov: 56, set: (p, c, l, k) => { c.set(k.x + 2.6 - p * 1.2, 0.4 + p * 0.3, k.z - 6.5 + p * 2.8); l.set(k.x, 2.2 + p * 2.5, k.z); } },
  { at: 54.0, fov: 60, set: (p, c, l, k) => { c.set(30 - p * 6, 5 + p * 16, k.z + 26); l.set(k.x, 8 + p * 6, k.z); } },
  { at: 57.4, fov: 52, set: (p, c, l, k) => { c.set(k.x + 7 - p, 1.0, k.z - 10 + p * 1.5); l.set(k.x, 4 + p * 2, k.z); } },
  // ACT IV
  { at: 59.8, fov: 62, set: (p, c, l, k) => { c.set(k.x + 5, 3.4 + p, k.z + 9); l.set(0, 2.2, GIANT_STAND.z); } },
  { at: 61.4, fov: 52, set: (p, c, l) => { c.set(19 - p * 2, 3.5, GIANT_STAND.z + 7); l.set(0, 3, GIANT_STAND.z); } },
  // ACT V
  { at: 63.3, fov: 60, set: (p, c, l) => { c.set(52 - p * 6, 14 + p * 3, 4); l.set(0, 6, GIANT_STAND.z); } },
  { at: 70.0, fov: 50, set: (p, c, l, k) => { const a = Math.PI + 0.5 + p * 1.2; c.set(k.x + Math.sin(a) * 7, 2, k.z + Math.cos(a) * 7); l.set(k.x, 1.3, k.z); } },
  { at: 76.0, fov: 55, set: (p, c, l) => { const a = 0.4 + p * 1.6; c.set(Math.sin(a) * 34, 12, GIANT_STAND.z + Math.cos(a) * 34); l.set(0, -2, GIANT_STAND.z); } },
  // the last shot: up and away over the ruins as it fades out
  { at: 80.0, fov: 55, set: (p, c, l, k) => { c.set(6 + p * 14, 3 + p * 26, k.z + 10 + p * 24); l.set(0, 0, GIANT_STAND.z + 6); } },
];
