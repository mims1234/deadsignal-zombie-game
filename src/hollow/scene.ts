/**
 * SLIME HOLLOW: the scene, start to end, on a 76-second loop. One clock drives the cast, the crowds, the effects, the
 * grade, the sound and the film camera, so nothing can drift apart.
 *
 * EMBERS        0   the burned village; Kael on his knees where it happened; the clan behind Goro's planted sword,
 *                   Oriha's light on Raigen, Suzu crying; the Iron Choir's torches marching closer
 * WHO IS THAT  10   Kael walks out of the smoke toward the army, black ooze dripping off his hands; the army halts
 *                   and mutters
 * WHO ARE YOU  18   the ooze climbs him, his hair goes long and white; Raigen: "...Kael?" Goro: "That's not him."
 *                   Raigen: "...Who are you?"; his face, crying
 * THE ORDER    26   "You came for them." The officer: "Advance! Burn the rest!" The torches go out row by row and the
 *                   colour drains from the world. "None of you leave."
 * THE HOLLOW   34   spikes burst through the ranks; he rises over a wall of crystal and cold fire; the Choir breaks and
 *                   runs; Nagi carries Suzu out; Captain Auren on his knees begging; the blade goes up; he dives
 * THE CATCH    50   CLINK: Raigen catches it. "Ngh... my head... Do you even get it?! This was never about me!" WHACK
 *                   with the scabbard and crimson lightning: "KAEL!" Everyone freezes; the ooze slides off him
 * TODAY        60   Raigen, spent: "Today..." - and nothing after it. He goes still. "...Rai?" Suzu runs to her
 *                   brother: "Brother... please wake up..." Oriha kneels to heal him and no light comes. Auren crawls
 *                   away alive. A cold grey dawn that gives no colour back; the credit; fade to black
 */
import * as THREE from 'three';
import { easePose, type Figure, KAEL_HAIR, KAEL_HOLLOW_HAIR, POSES, type PoseName } from './cast';
import type { Crowd, Member } from './crowd';
import { CRIMSON, CYAN, type Fx, GOLD, type Spike } from './fx';
import type { Grade } from './grade';
import { FOG_DAWN, FOG_NIGHT, heightAt, type World } from './world';
import { rng } from '../freeroam/world';

export const LOOP = 76;
/** Where the scene stops when it is not looping: the dawn. */
export const END_HOLD = 71;

export const PHASES: [number, string][] = [
  [0, 'Embers'],
  [10, 'Who is that'],
  [18, 'Who are you'],
  [26, 'The order'],
  [34, 'The Hollow'],
  [50, 'The catch'],
  [60, 'Today'],
];

export type Cue =
  | 'drip'
  | 'march'
  | 'halt'
  | 'murmur'
  | 'transform'
  | 'heartbeat'
  | 'drain'
  | 'spikes'
  | 'spike-line'
  | 'rise'
  | 'crystal'
  | 'panic'
  | 'raise'
  | 'dash'
  | 'clink'
  | 'grind'
  | 'whack'
  | 'thunder'
  | 'shatter'
  | 'shed'
  | 'dawn'
  | 'loop';

export type Who = 'kael' | 'raigen' | 'suzu' | 'goro' | 'nagi' | 'oriha' | 'auren';
export type Cast = Record<Who, Figure>;

/** A track key: from `t` the figure holds `pose`, and travels (eased) toward the next key's spot. */
interface Key {
  t: number;
  x: number;
  z: number;
  /** height off the ground (flying, carried) */
  y: number;
  pose: PoseName;
  rate: number;
  /** walking or running from this key on (0..1) */
  run: number;
  /** which way to face: an angle, or someone to look at */
  face: number | Who | null;
}
const k = (t: number, x: number, z: number, pose: PoseName, rate: number, o: { y?: number; run?: number; face?: number | Who } = {}): Key => ({
  t, x, z, pose, rate, y: o.y ?? 0, run: o.run ?? 0, face: o.face ?? null,
});
const PI = Math.PI;

const TRACKS: Record<Who, Key[]> = {
  kael: [
    k(0, 1.2, 23.4, 'grieve', 3, { face: 0 }),
    k(9.0, 1.2, 23.4, 'stand', 2.5, { face: 0 }),
    k(10.2, 1.2, 23.0, 'trudge', 4, { run: 0.55, face: PI }),
    k(17.6, 0.3, 1.5, 'stand', 3, { face: PI }),
    k(30.6, 0.3, 1.5, 'order', 3, { face: PI }),
    k(34.0, 0.3, 1.5, 'unleash', 7, { face: PI }),
    k(36.8, 0.3, 1.5, 'unleash', 3, { face: PI }),
    k(38.8, 0.3, -2.5, 'hover', 2.2, { y: 3.6, face: PI }),
    k(47.2, 0.3, -2.5, 'overhead', 4, { y: 4.0, face: PI }),
    k(49.3, 0.3, -2.5, 'overhead', 8, { y: 4.4, face: PI }),
    k(50.0, 0.3, -8.15, 'strike', 16, { face: PI }),
    k(50.12, 0.3, -8.15, 'press', 9, { face: PI }),
    k(55.6, 0.3, -8.15, 'struck', 20, { face: PI }),
    k(56.3, 0.9, -6.6, 'struck', 4, { face: PI - 0.4 }),
    k(57.4, 0.9, -6.6, 'spent', 2.5, { face: PI - 0.3 }),
    k(62.2, 0.9, -6.6, 'spent', 3, { face: 'raigen' }),
    k(63.6, 0.75, -8.1, 'hold', 3, { run: 0.3, face: 'raigen' }),
    k(64.6, 0.75, -8.1, 'spent', 2, { face: 'raigen' }),
  ],
  raigen: [
    k(0, -1.6, 8.6, 'propped', 3, { face: PI - 0.3 }),
    k(17.8, -1.6, 8.6, 'lookUp', 3, { face: 'kael' }),
    k(26.0, -1.6, 8.6, 'lookUp', 2, { face: 'kael' }),
    k(47.4, -1.6, 8.6, 'rise', 4, { face: 'kael' }),
    k(48.6, -1.6, 8.6, 'dash', 10, { run: 1, face: 'auren' }),
    k(50.0, 0.3, -9.25, 'catch', 18, { face: 0 }),
    k(55.25, 0.3, -9.25, 'whack', 16, { face: 0.2 }),
    k(56.6, 0.1, -9.0, 'slump', 3, { face: 'kael' }),
    k(59.8, 0.1, -9.0, 'smile', 2.5, { face: 'kael' }),
    k(61.6, 0.1, -9.0, 'still', 1.6, { face: 'kael' }),
  ],
  suzu: [
    k(0, -0.7, 9.7, 'huddle', 3, { face: 'raigen' }),
    k(35.0, -0.4, 9.6, 'carried', 8, { y: 0.55, face: PI }),
    k(37.0, -3.2, 14.4, 'carried', 6, { y: 0.55, face: 0 }),
    k(37.6, -3.4, 14.2, 'huddle', 4, { face: PI }),
    k(62.6, -3.4, 14.2, 'run', 6, { run: 1, face: 'raigen' }),
    k(65.6, -0.6, -9.6, 'huddle', 6, { face: 'raigen' }),
  ],
  nagi: [
    k(0, 2.9, 7.4, 'watch', 3, { face: PI }),
    k(34.2, 2.9, 7.4, 'dash', 12, { run: 1, face: 'suzu' }),
    k(35.0, -0.2, 9.4, 'carry', 10, { face: PI }),
    k(35.4, -0.2, 9.4, 'carry', 8, { run: 0.9, face: 0 }),
    k(37.0, -2.9, 14.7, 'carry', 6, { face: 0 }),
    k(37.6, -2.9, 13.8, 'guard', 5, { face: PI }),
    k(63.0, -2.9, 13.8, 'walk', 4, { run: 0.5, face: 'kael' }),
    k(69.5, 2.3, -5.2, 'idle', 3, { face: 'kael' }),
  ],
  goro: [
    k(0, 0.9, 6.3, 'plant', 3, { face: PI }),
    k(19.6, 0.9, 6.3, 'plant', 3, { face: 'kael' }),
    k(26.0, 0.9, 6.3, 'plant', 3, { face: PI }),
    k(34.0, 0.9, 6.3, 'shield', 6, { face: PI }),
    k(56.5, 0.9, 6.3, 'plant', 3, { face: PI }),
    k(63.4, 0.9, 6.3, 'walk', 4, { run: 0.5, face: 'kael' }),
    k(69.8, 2.9, -4.4, 'idle', 3, { face: 'kael' }),
  ],
  oriha: [
    k(0, -2.5, 8.9, 'heal', 3, { face: 'raigen' }),
    k(48.6, -2.5, 8.9, 'heal', 3, { face: PI }),
    k(63.2, -2.5, 8.9, 'walk', 4, { run: 0.5, face: 'raigen' }),
    k(69.6, -0.9, -8.2, 'heal', 3, { face: 'raigen' }),
  ],
  auren: [
    k(0, 0.4, -23.2, 'officer', 3, { run: 0.45, face: 0 }),
    k(10.0, 0.4, -11.2, 'officer', 4, { face: 0 }),
    k(35.4, 0.4, -11.2, 'stagger', 8, { face: 0 }),
    k(36.4, 0.4, -11.9, 'fallen', 6, { face: 0 }),
    k(43.4, 0.4, -10.6, 'beg', 4, { face: 0 }),
    k(50.0, 0.4, -10.6, 'cower', 14, { face: 0 }),
    k(58.5, 0.4, -10.6, 'crawl', 3, { run: 0.3, face: PI }),
    k(63.0, 1.4, -15.5, 'limp', 3, { run: 0.4, face: PI }),
    k(71.0, 2.0, -24.0, 'limp', 3, { face: PI }),
  ],
};

const seg = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number): number => x * x * (3 - 2 * x);
const lerp = THREE.MathUtils.lerp;
const EYE_GLOW = new THREE.Color(0.25, 1.0, 1.3);
const angleTo = (from: THREE.Vector3, to: THREE.Vector3): number => Math.atan2(to.x - from.x, to.z - from.z);

/** Where a track puts its figure at `t` (height in `out.y` is above the ground), and the key in force. */
function sample(keys: Key[], t: number, out: THREE.Vector3): Key {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  if (!b) {
    out.set(a.x, a.y, a.z);
    return a;
  }
  const e = smooth(seg(t, a.t, b.t));
  out.set(lerp(a.x, b.x, e), lerp(a.y, b.y, e), lerp(a.z, b.z, e));
  return a;
}

// ---------------------------------------------------------------------------------------------------------------------
// the crowds: who stands where

export interface CrowdPlan {
  choir: ConstructorParameters<typeof Crowd>[1];
  village: ConstructorParameters<typeof Crowd>[1];
}

/** The Iron Choir and the village, sized for the graphics level (the far ranks and the ridge thin out on LOW). */
export function planCrowds(level: 'low' | 'medium' | 'high'): CrowdPlan {
  const r = rng(808);
  const choir: CrowdPlan['choir'] = [];
  const add = (kind: Member['kind'], hx: number, hz: number, row: number, col: number, scale = 1): void => {
    choir.push({ kind, hx: hx + (r() - 0.5) * 0.25, hz: hz + (r() - 0.5) * 0.25, row, col, seed: r(), scale: scale * (0.94 + r() * 0.12) });
  };
  // the front: two ranks of spearmen with shields, the officers, a rank of torches
  for (let row = 0; row < 2; row++) for (let c = 0; c < 20; c++) add('spear', -11 + c * 1.15 + row * 0.55, -12.4 - row * 1.2, row, c);
  add('officer', -8.2, -11.4, 0, 0);
  add('officer', 8.6, -11.4, 0, 1);
  add('officer', -2.4, -15.6, 2, 2);
  for (let c = 0; c < 30; c++) add('torch', -14.5 + c * 1.0, -15.0 - (c % 2) * 0.5, 2, c);
  // the mass of the ranks behind: spears, with a torch every few
  const rows = level === 'high' ? 10 : level === 'medium' ? 6 : 3;
  for (let row = 0; row < rows; row++) for (let c = 0; c < 18; c++) add(c % 5 === 2 ? 'torch' : 'spear', -14 + c * 1.65 + (row % 2) * 0.8, -17.2 - row * 1.75, 3 + row, c);
  // archers and banners on the ridge
  const ridge = level === 'high' ? 28 : level === 'medium' ? 20 : 12;
  for (let c = 0; c < ridge; c++) {
    const x = -17 + (c / (ridge - 1)) * 34;
    add(c % 4 === 1 ? 'banner' : 'archer', x, -45 - r() * 3, 14, c);
  }

  const village: CrowdPlan['village'] = [];
  const vAdd = (kind: Member['kind'], hx: number, hz: number, scale = 1): void => {
    village.push({ kind, hx, hz, row: 0, col: village.length, seed: r(), scale: scale * (0.95 + r() * 0.1) });
  };
  // the wounded, lying behind the clan's line
  for (const [x, z] of [[-5.5, 11], [-3.2, 12.6], [4.6, 11.4], [6.8, 13.2], [-7.4, 14.6], [2.2, 15.8], [-1.0, 17.2], [8.4, 16.4], [-5.0, 18.4], [5.0, 18.8], [-8.6, 10.2], [9.6, 10.6]]) vAdd('wounded', x, z);
  // the clan's fighters along the line, beaten
  for (const [x, z] of [[-7.2, 7.6], [-5.6, 8.2], [-4.2, 7.4], [4.4, 7.8], [5.8, 8.4], [7.4, 7.6], [-9.0, 8.8], [9.2, 8.6], [-3.6, 9.4], [3.8, 9.8]]) vAdd('fighter', x, z);
  // children and elders huddled together
  for (const [x, z] of [[-5.6, 12.6], [-6.2, 13.2], [-4.9, 13.4]]) vAdd('child', x, z, 0.62);
  for (const [x, z] of [[5.4, 12.2], [6.0, 12.8]]) vAdd('child', x, z, 0.6);
  for (const [x, z] of [[-6.4, 12.0], [-5.0, 12.2], [5.0, 11.6], [6.4, 12.4]]) vAdd('elder', x, z, 0.92);
  return { choir, village };
}

// ---------------------------------------------------------------------------------------------------------------------

/** The film camera's beats. */
interface Shot {
  at: number;
  fov: number;
  set: (p: number, cam: THREE.Vector3, look: THREE.Vector3, d: Director) => void;
}

interface Kick {
  at: number;
  amp: number;
  dur: number;
}

export class Director {
  t = 0;
  loop = true;
  held = false;
  shake = 0;
  readonly shakeAt = new THREE.Vector3();
  /** the Hollow's hold on Kael (0..1), for the page */
  hollow = 0;
  /** how high the village fires burn (0..1) */
  fire = 1;
  onCue: (cue: Cue, at: THREE.Vector3) => void = () => {};
  /** where everyone is (feet), for the camera */
  readonly at: Record<Who, THREE.Vector3> = { kael: new THREE.Vector3(), raigen: new THREE.Vector3(), suzu: new THREE.Vector3(), goro: new THREE.Vector3(), nagi: new THREE.Vector3(), oriha: new THREE.Vector3(), auren: new THREE.Vector3() };

  private prev = 0;
  private kicks: Kick[] = [];
  private readonly spikes: Spike[];
  /** per choir member: when a spike threw them (Infinity: never), and from where */
  private readonly hit: { at: number; fx: number; fz: number }[];
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly tipR = new THREE.Vector3();
  private readonly tipL = new THREE.Vector3();
  private readonly head = new THREE.Vector3();
  private readonly hairCol = new THREE.Color();
  private readonly capeCol = new THREE.Color(0x020306);
  private readonly fogCol = new THREE.Color();

  constructor(
    private readonly cast: Cast,
    private readonly choir: Crowd,
    private readonly village: Crowd,
    private readonly fx: Fx,
    private readonly world: World,
    private readonly grade: Grade,
  ) {
    this.spikes = layOutSpikes();
    fx.setSpikes(this.spikes);
    this.hit = choir.members.map(() => ({ at: Infinity, fx: 0, fz: 0 }));
  }

  restart(): void {
    this.t = 0;
    this.prev = 0;
    this.held = false;
    this.kicks = [];
    for (const h of this.hit) h.at = Infinity;
    this.fx.reset();
    this.onCue('loop', this.at.kael);
  }

  phase(): string {
    if (this.held) return 'Dawn';
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
    const fx = this.fx;
    const c = this.cast;

    // ---------------- the cast ----------------
    const keys = {} as Record<Who, Key>;
    for (const who of Object.keys(TRACKS) as Who[]) {
      keys[who] = sample(TRACKS[who], t, this.at[who]);
      const f = c[who];
      const p = this.at[who];
      f.root.position.set(p.x, heightAt(p.x, p.z) + p.y, p.z);
      f.stride = keys[who].run;
    }
    for (const who of Object.keys(TRACKS) as Who[]) {
      const key = keys[who];
      const f = c[who];
      let yaw = f.root.rotation.y;
      if (typeof key.face === 'number') yaw = key.face;
      else if (key.face) yaw = angleTo(this.at[who], this.at[key.face]);
      // turn the short way round, eased
      const d = Math.atan2(Math.sin(yaw - f.root.rotation.y), Math.cos(yaw - f.root.rotation.y));
      f.root.rotation.y += d * (1 - Math.exp(-dt * (t < 0.05 ? 1e3 : 7)));
      easePose(f.pose, POSES[key.pose], key.rate, dt);
      f.update(dt, clock);
    }
    // Raigen: the clench and the turn of his head toward Kael while he watches
    if (t > 17.8 && t < 47.4) c.raigen.pose.look = 0.25;

    // ---------------- the Hollow on Kael ----------------
    const hollow = t < 10 ? 0 : t < 18 ? 0.22 * smooth(seg(t, 10, 17)) : t < 26 ? lerp(0.22, 0.75, smooth(seg(t, 18, 25.5))) : t < 34 ? lerp(0.75, 0.9, seg(t, 26, 33)) : t < 56 ? 1 : 1 - smooth(seg(t, 56, 60));
    this.hollow = hollow;
    const shed = t >= 56 && t < 61 ? smooth(seg(t, 56, 59.5)) : t >= 61 ? 1 : 0;
    const kael = c.kael;
    // the hair grows long and white, and darkens back as it lets him go
    const hairK = t < 56 ? smooth(seg(t, 11, 25)) : 1 - smooth(seg(t, 56.5, 61));
    kael.setHair(lerp(0.08, 1.05, hairK), this.hairCol.copy(KAEL_HAIR).lerp(KAEL_HOLLOW_HAIR, hairK));
    kael.setCape(this.capeCol, hollow > 0.45 && shed < 0.85);
    kael.eyeMat.color.setRGB(0.08, 0.05, 0.06).lerp(EYE_GLOW, smooth(seg(hollow, 0.55, 0.85)) * (1 - shed));
    kael.tipR.getWorldPosition(this.tipR);
    kael.weaponR.getWorldPosition(this.hand);
    const kAt = kael.root.position;
    const groundK = heightAt(kAt.x, kAt.z);
    const spread = t < 10 ? 0 : t < 34 ? lerp(0.35, 2.4, smooth(seg(t, 10, 33))) : t < 38 ? lerp(2.4, 6.5, smooth(seg(t, 34, 35.5))) : t < 56 ? 5.5 : 5.5 * (1 - smooth(seg(t, 56, 61)));
    const glow = 0.7 + smooth(seg(t, 26, 31)) * 0.6;
    fx.setSlime(hollow, spread, shed, kAt, groundK, this.hand, glow);
    this.world.hollowLight.position.set(kAt.x, groundK + 1.2 + (kAt.y - groundK) * 0.8, kAt.z);
    this.world.hollowLight.intensity = hollow * hollow * 9 * (1 - shed);
    fx.kaelAura.set(t >= 24 && t < 57 ? 0.6 * smooth(seg(t, 24, 30)) * (1 - seg(t, 55.6, 57)) : 0, kAt, t > 34 && t < 36 ? 1 : 0, 0, t > 34 ? 1 : 0.6, t > 34 ? 1.6 : 1);

    // ---------------- the clan's lights ----------------
    c.raigen.headAt.getWorldPosition(this.head);
    fx.heal.set(t < 48.6 ? 0.45 : 0, this.v.copy(this.at.raigen).setY(heightAt(this.at.raigen.x, this.at.raigen.z) + 0.2), 0, 0, 0.7, 0.6);
    const raigenUp = t >= 48.2 && t < 57 ? smooth(seg(t, 48.2, 48.8)) * (1 - seg(t, 56, 57)) : 0;
    fx.raigenAura.set(raigenUp * 0.45, this.v.copy(c.raigen.root.position), t > 55.2 && t < 56 ? 0.6 : 0, 0.4, 0.6, 1.4);

    // ---------------- the wall ----------------
    const wall = t < 38.4 ? 0 : t < 55.7 ? smooth(seg(t, 38.4, 42.5)) : 1 - seg(t, 55.7, 56.2);
    fx.setWall(wall, this.w.set(0.3, 0, -2.5));

    // ---------------- lightning: the dash, the locked blades, the whack ----------------
    const pairs: [THREE.Vector3, THREE.Vector3][] = [];
    const rAt = c.raigen.root.position;
    let bolt = 0;
    if (t > 48.6 && t < 50.1) {
      bolt = 0.8;
      for (let i = 0; i < 3; i++) pairs.push([new THREE.Vector3(rAt.x, rAt.y + 0.2, rAt.z), new THREE.Vector3(rAt.x + Math.sin(clock * 30 + i * 2) * 1.2, rAt.y + 1.6 + i * 0.3, rAt.z + Math.cos(clock * 27 + i) * 1.2)]);
    } else if (t > 50.0 && t < 55.3) {
      // crackling round the two blades where they meet
      bolt = 0.35 + 0.2 * Math.sin(clock * 17);
      c.raigen.tipR.getWorldPosition(this.tipL);
      pairs.push([this.tipR.clone(), this.tipL.clone()]);
      pairs.push([this.tipL.clone(), new THREE.Vector3(this.tipL.x + Math.sin(clock * 21) * 0.8, this.tipL.y + 0.5, this.tipL.z)]);
    } else if (t > 55.3 && t < 56.6) {
      bolt = 1.4 * (1 - seg(t, 55.9, 56.6));
      c.raigen.tipL.getWorldPosition(this.tipL);
      kael.headAt.getWorldPosition(this.head);
      pairs.push([this.tipL.clone(), this.head.clone()]);
      // and from the sky down onto him
      pairs.push([new THREE.Vector3(rAt.x + 3, 40, rAt.z - 6), new THREE.Vector3(rAt.x, rAt.y + 1.4, rAt.z)]);
      pairs.push([new THREE.Vector3(rAt.x - 2, 38, rAt.z + 4), this.head.clone()]);
    }
    fx.setBolts(pairs, bolt, t > 55.3 ? 0.35 : 0.1, dt);

    // ---------------- the crowds ----------------
    this.driveChoir(t, dt);
    this.driveVillage(t);
    this.choir.update(dt, heightAt);
    this.village.update(dt, heightAt);

    // ---------------- the grade ----------------
    const g = this.grade.u;
    // after: the colour never really comes back
    const drain = t < 56 ? smooth(seg(t, 26.5, 31.5)) : t < 60 ? lerp(1, 0.85, seg(t, 56, 60)) : lerp(0.85, 0.6, smooth(seg(t, 60, 70.5)));
    g.uDrain.value = drain;
    g.uWarm.value = t > 48.4 && t < 57.5 ? 1 : 0;
    g.uWarmFirst.value = 0;
    g.uHalftone.value = 0.6 * drain * (t < 60 ? 1 : 1 - seg(t, 60, 64) * 0.5);
    g.uImpact.value = Math.max(
      t >= 50.0 && t < 50.25 ? (t < 50.09 ? 1 : 1 - seg(t, 50.09, 50.25)) : 0,
      t >= 55.6 && t < 55.95 ? (t < 55.75 ? 1 : 1 - seg(t, 55.75, 55.95)) : 0,
      t >= 34.2 && t < 34.32 ? 0.7 : 0,
    );
    g.uSpeed.value = Math.max(t > 34.2 && t < 35.2 ? 0.5 * (1 - seg(t, 34.2, 35.2)) : 0, t > 49.3 && t < 50.05 ? 1 : 0, t > 55.25 && t < 55.7 ? 1 : 0);
    // a cold grey dawn
    const dawn = smooth(seg(t, 62, 71)) * 0.6;
    g.uDawn.value = 0;
    g.uTime.value = clock;
    g.uFade.value = t < 1.4 ? 1 - smooth(seg(t, 0, 1.4)) : t > 72.4 ? smooth(seg(t, 72.4, 75.6)) : 0;

    // ---------------- the world ----------------
    // (the page runs the world's own animation with this, and the camera the smoke turns to)
    this.fire = t < 26.5 ? 1 : lerp(1, 0.3, smooth(seg(t, 26.5, 31)));
    this.world.skyU.uDawn.value = dawn * 0.95;
    this.world.skyU.uDark.value = drain * (t < 60 ? 1 : 0.5) * 0.8;
    this.world.dawn.intensity = dawn * 1.6;
    this.world.hemi.intensity = 0.8 + dawn * 1.4 - drain * 0.2;
    this.world.moon.intensity = 0.9 * (1 - dawn * 0.5);
    this.fogCol.copy(FOG_NIGHT).lerp(FOG_DAWN, dawn);
    this.world.fog.color.copy(this.fogCol);
    this.world.fog.density = 0.016 + drain * 0.006 - dawn * 0.004;
    // the ash hangs still in the frozen instants
    const frozen = (t > 50.0 && t < 50.35) || (t > 55.6 && t < 56.1) || (t > 56.4 && t < 57.6);
    fx.setAir(frozen ? 0.04 : 1, t < 26.5 ? 1 : 0.25);

    // ---------------- shake ----------------
    let shake = 0;
    if (t > 34 && t < 45) shake = 0.25 * (1 - seg(t, 36, 45));
    if (t > 49.6 && t < 55.5) shake = 0.12;
    this.kicks = this.kicks.filter((x) => t - x.at < x.dur && t >= x.at);
    for (const x of this.kicks) shake = Math.max(shake, x.amp * (1 - (t - x.at) / x.dur));
    this.shake = shake;
    this.shakeAt.copy(t > 49 ? this.at.raigen : kAt);

    this.events(t);
    fx.update(dt, clock, t);
  }

  // ---------------- the Iron Choir ----------------
  private driveChoir(t: number, dt: number): void {
    const ms = this.choir.members;
    const kx = this.at.kael.x;
    // spikes born since the last frame throw anyone standing on them
    for (const sp of this.spikes) {
      if (!(sp.t > this.prev && sp.t <= t)) continue;
      ms.forEach((m, i) => {
        if (this.hit[i].at < Infinity || spared(m)) return;
        const dx = m.x - sp.x;
        const dz = m.z - sp.z;
        if (dx * dx + dz * dz < 1.25) this.hit[i] = { at: sp.t, fx: sp.x, fz: sp.z };
      });
    }
    const march = 12 * (1 - smooth(seg(t, 0, 10)));
    ms.forEach((m, i) => {
      const s = m.seed;
      const h = this.hit[i];
      // ---- marching up, halting ----
      let x = m.hx;
      let z = m.hz - march;
      let yaw = 0;
      let stride = t < 10.2 ? 0.5 : 0;
      let lean = 0;
      let head = 0;
      let kneel = 0;
      let crouch = 0;
      let lie = 0;
      let cover = 0;
      let y = 0;
      // the mutter: heads turning to each other
      if (t > 10.5 && t < 26) {
        yaw = Math.sin(t * 0.8 + s * 20) * 0.35 * smooth(seg(t, 10.5, 12));
        head = 0.05;
      }
      // the order: they brace
      if (t > 28.4 && t < 34) lean = 0.15 * seg(t, 28.4, 29.5);
      // ---- the rout ----
      const fleeAt = 35.3 + Math.min(m.row, 6) * 0.22 + s * 1.4;
      const kneels = kneeler(m);
      if (t >= 34 && h.at === Infinity) {
        if (kneels) {
          // too afraid to run: they drop where they stand, and cover their heads when he comes down
          kneel = smooth(seg(t, 42.6 + s, 43.6 + s));
          crouch = kneel * 0.5;
          lean = kneel * 0.5;
          head = -0.2;
          cover = smooth(seg(t, 49.2, 49.8)) * (1 - smooth(seg(t, 57, 59)));
          if (t > 62 + s * 2) {
            // getting up and going back to their own
            const g = seg(t, 62 + s * 2, 63 + s * 2);
            kneel *= 1 - g;
            yaw = PI * g;
            stride = 0.45 * g;
            z -= (t - 62 - s * 2) * 1.2 * g;
          }
        } else if (t >= fleeAt) {
          // they turn and run, until everything freezes; then they look back; then they go
          const run = Math.min(t, 50.4) - fleeAt;
          const dist = Math.max(0, run) * (4.6 + s * 1.2);
          const dirX = (m.x - kx) * 0.15;
          z -= dist;
          x += dirX * Math.min(1, run * 0.3);
          yaw = PI;
          stride = t < 50.2 ? 1 : 0;
          lean = t < 50.2 ? 0.35 : 0;
          if (t > 50.4) {
            yaw = PI * (1 - smooth(seg(t, 51, 52.4)));
            head = -0.1;
          }
          if (t > 58.5 + s * 2.5) {
            const g = seg(t, 58.5 + s * 2.5, 59.5 + s * 2.5);
            yaw = PI * g;
            stride = 0.45 * g;
            z -= (t - 58.5 - s * 2.5) * 1.3 * g;
          }
        } else {
          // the instant before they run: a step back, arms up
          cover = seg(t, 34.2, 34.6) * 0.6;
          lean = -0.2;
        }
      }
      // ---- thrown by a spike: up and back, and down on the ground to stay ----
      if (t >= h.at) {
        const a = t - h.at;
        const dx = m.hx - h.fx;
        const dz = m.hz - march - h.fz;
        const d = Math.hypot(dx, dz) || 1;
        const fly = smooth(Math.min(1, a / 0.7));
        // (where they stood when it hit, so a runner falls where he ran to)
        const fleeAt0 = 35.3 + Math.min(m.row, 6) * 0.22 + s * 1.4;
        const ran = !kneels && h.at > fleeAt0 ? (h.at - fleeAt0) * (4.6 + s * 1.2) : 0;
        x = m.hx + (dx / d) * 2.6 * fly;
        z = m.hz - march - ran + (dz / d) * 2.6 * fly;
        y = Math.sin(Math.min(1, a / 0.7) * PI) * (1.0 + s * 0.8);
        lie = smooth(Math.min(1, a / 0.55));
        yaw = Math.atan2(-dx, -dz);
        stride = 0;
        lean = 0;
        cover = 0;
        kneel = 0;
      }
      m.x = x;
      m.z = z;
      m.y = y;
      m.yaw = yaw;
      m.stride = stride;
      m.lean = lean;
      m.head = head;
      m.kneel = kneel;
      m.crouch = crouch;
      m.lie = lie;
      m.cover = cover;
      // the torches go out row by row from the front, as the colour leaves
      const out = 27.4 + Math.min(m.row, 12) * 0.42 + s * 0.5;
      m.lit = t < out ? 1 : Math.max(0, 1 - (t - out) / 0.25);
      // the banners on the ridge freeze into crystal
      m.frost = m.kind === 'banner' ? smooth(seg(t, 40 + s * 2, 41.2 + s * 2)) * (t < 56 ? 1 : 1 - seg(t, 56, 58)) : 0;
    });
    void dt;
  }

  // ---------------- the village ----------------
  private driveVillage(t: number): void {
    const kx = this.at.kael.x;
    const kz = this.at.kael.z;
    for (const m of this.village.members) {
      const s = m.seed;
      m.x = m.hx;
      m.z = m.hz;
      m.y = 0;
      m.stride = 0;
      m.cover = 0;
      m.crouch = 0;
      m.kneel = 0;
      m.lie = 0;
      m.lean = 0;
      m.head = 0;
      m.lit = 0;
      const toKael = Math.atan2(kx - m.x, kz - m.z);
      if (m.kind === 'wounded') {
        m.lie = 0.85 + s * 0.15;
        m.yaw = s * 6;
        continue;
      }
      if (m.kind === 'fighter') {
        // beaten, on a knee; on their feet and backing off when he changes; down and covering in the storm
        const up = t > 19 + s ? smooth(seg(t, 19 + s, 20 + s)) : 0;
        m.kneel = 0.7 * (1 - up);
        m.crouch = 0.3 + up * 0.25;
        m.lean = 0.3 - up * 0.35;
        m.yaw = t > 17 ? toKael : PI;
        if (t > 34 && t < 58) {
          m.cover = smooth(seg(t, 34, 34.6)) * 0.8;
          m.crouch = 0.75;
          m.kneel = 0.5;
          m.yaw = toKael;
        }
        if (t > 63 + s * 2) {
          // they come out to him
          const g = seg(t, 63 + s * 2, 64 + s * 2);
          m.stride = 0.4 * g * (t < 67 ? 1 : 0);
          m.kneel = m.cover = 0;
          m.crouch = 0;
          m.lean = 0.1;
          const walk = Math.min(t, 67) - 63 - s * 2;
          m.z -= Math.max(0, walk) * 0.9 * g;
          m.yaw = toKael;
        }
        continue;
      }
      // children and elders: huddled together, heads covered through the storm, looking up at the dawn
      m.crouch = m.kind === 'child' ? 0.7 : 0.4;
      m.kneel = m.kind === 'elder' ? 0.6 : 0.3;
      m.lean = 0.35;
      m.head = 0.3;
      m.yaw = PI + (s - 0.5) * 0.8;
      if (t > 34 && t < 58) m.cover = smooth(seg(t, 34, 34.5)) * 0.9;
      if (t > 64 + s * 2) {
        const g = smooth(seg(t, 64 + s * 2, 65.5 + s * 2));
        m.crouch *= 1 - g;
        m.kneel *= 1 - g;
        m.lean = 0.35 * (1 - g);
        m.head = 0.3 - g * 0.55;
      }
    }
  }

  /** One-off moments. */
  private events(t: number): void {
    const fx = this.fx;
    const kAt = this.cast.kael.root.position;
    if (this.crossed(0.2)) this.onCue('march', this.at.auren);
    if (this.crossed(9.6)) this.onCue('halt', this.at.auren);
    if (this.crossed(10.4)) this.onCue('drip', kAt);
    if (this.crossed(11.2)) this.onCue('murmur', this.at.auren);
    if (this.crossed(18.4)) this.onCue('transform', kAt);
    for (const hb of [21.6, 22.6, 23.5, 24.4, 25.2]) if (this.crossed(hb)) this.onCue('heartbeat', kAt);
    if (this.crossed(26.6)) this.onCue('drain', kAt);
    if (this.crossed(34.2)) {
      fx.wave(this.v.copy(kAt).setY(0.06), 30, 1.2, CYAN);
      fx.wave(this.w.copy(kAt).setY(0.07), 16, 0.8, [2, 3.4, 3.8]);
      fx.sparks.burst(this.v.copy(kAt).setY(1.2), 220, 14, CYAN, [3, 3.4, 3.8], 0.3);
      this.onCue('spikes', kAt);
      this.kick(1.0, 1.0);
    }
    for (const lt of LINE_STARTS) if (this.crossed(lt)) this.onCue('spike-line', this.v.set(kAt.x, 0, kAt.z - 10));
    if (this.crossed(35.4)) this.onCue('panic', this.at.auren);
    if (this.crossed(37.0)) this.onCue('rise', kAt);
    if (this.crossed(38.6)) {
      fx.wave(this.v.set(0.3, 0.06, -2.5), 22, 1.0, CYAN);
      this.onCue('crystal', this.v);
    }
    if (this.crossed(47.2)) this.onCue('raise', kAt);
    if (this.crossed(48.6)) {
      fx.wave(this.v.copy(this.at.raigen).setY(0.06), 10, 0.6, CRIMSON);
      this.onCue('dash', this.at.raigen);
    }
    if (this.crossed(50.0)) {
      const at = this.v.set(0.3, 1.9, -8.7);
      fx.sparks.burst(at, 260, 16, [4, 4, 4], CYAN, 0.35);
      fx.wave(this.w.set(0.3, 0.06, -8.7), 20, 0.9, [3, 3.4, 3.8]);
      this.onCue('clink', at);
      this.kick(1.2, 0.6);
    }
    if (this.crossed(50.15)) this.onCue('grind', this.v.set(0.3, 1.9, -8.7));
    if (t > 50.1 && t < 55.3 && Math.random() < 0.35) fx.sparks.burst(this.v.copy(this.tipR), 3, 5, [4, 3.6, 3.2], CYAN, 0.6);
    if (this.crossed(55.6)) {
      this.cast.kael.headAt.getWorldPosition(this.head);
      fx.sparks.burst(this.head, 260, 18, CRIMSON, GOLD, 0.3);
      fx.wave(this.v.copy(this.at.raigen).setY(0.06), 26, 1.0, CRIMSON);
      fx.wave(this.w.copy(this.at.raigen).setY(0.07), 14, 0.7, GOLD);
      this.onCue('whack', this.head);
      this.onCue('thunder', this.head);
      this.kick(1.4, 0.9);
    }
    if (this.crossed(55.8)) {
      fx.shatterWall();
      this.onCue('shatter', this.v.set(0.3, 3, -2.5));
    }
    if (this.crossed(56.3)) this.onCue('shed', kAt);
    if (this.crossed(61.6)) this.onCue('dawn', this.at.raigen);
  }

  /** The film camera: one shot per beat, hard cuts between them. */
  film(cam: THREE.PerspectiveCamera): void {
    const t = this.t;
    let i = 0;
    while (i + 1 < SHOTS.length && SHOTS[i + 1].at <= t) i++;
    const shot = SHOTS[i];
    const p = seg(t, shot.at, SHOTS[i + 1]?.at ?? LOOP);
    shot.set(p, cam.position, this.v, this);
    if (cam.fov !== shot.fov) {
      cam.fov = shot.fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(this.v);
  }

  /** Kael's position in the air (feet), for the shots. */
  kaelY(): number {
    return this.cast.kael.root.position.y;
  }
}

/** The spearmen right in front of Auren don't run: they kneel with him. */
function kneeler(m: Member): boolean {
  return m.kind === 'spear' && m.row <= 1 && Math.abs(m.hx - 0.4) < 4.6;
}
/** Nobody right in front of Auren is thrown: they live to kneel there. */
function spared(m: Member): boolean {
  return kneeler(m) || m.kind === 'officer';
}

// ---------------------------------------------------------------------------------------------------------------------
// the spikes: a ring as he lets go, lines tearing out through the ranks, a second volley from the air

const LINE_STARTS = [34.9, 35.3, 35.7, 36.1, 36.6, 37.1, 37.6, 38.1, 38.6, 41.2, 41.9, 42.6, 43.3];

function layOutSpikes(): Spike[] {
  const r = rng(515);
  const out: Spike[] = [];
  const from = { x: 0.3, z: 1.5 };
  const add = (t: number, x: number, z: number, h: number, w: number, lean: number, toward: number, life = 2.6): void => {
    out.push({ t, x, z, y: heightAt(x, z) - 0.15, h, w, tiltX: Math.cos(toward) * lean, tiltZ: -Math.sin(toward) * lean, yaw: r() * 6, life });
  };
  // the first ring, then a wider one
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const d = 2.3 + r() * 1.2;
    add(34.2 + r() * 0.06, from.x + Math.sin(a) * d, from.z + Math.cos(a) * d, 2 + r() * 1.5, 0.9 + r() * 0.5, 0.45, a, 3.4);
  }
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + 0.1;
    const d = 5.2 + r() * 1.8;
    // (none on the village side: the clan is there)
    if (Math.cos(a) > 0.35) continue;
    add(34.5 + r() * 0.1, from.x + Math.sin(a) * d, from.z + Math.cos(a) * d, 3 + r() * 2, 1.2 + r() * 0.6, 0.35, a, 3.2);
  }
  // lines tearing out through the ranks, each racing outward
  LINE_STARTS.forEach((t0, li) => {
    const second = li >= 9;
    const ox = second ? 0.3 : from.x;
    const oz = second ? -2.5 : from.z;
    const a = PI + (second ? (r() - 0.5) * 1.1 : (li / 8 - 0.5) * 1.35) + (r() - 0.5) * 0.08;
    const step = second ? 1.6 : 1.3;
    for (let d = second ? 6 : 4; d < (second ? 46 : 34); d += step) {
      const wob = Math.sin(d * 0.4 + li) * 0.6;
      const x = ox + Math.sin(a) * d + Math.cos(a) * wob;
      const z = oz + Math.cos(a) * d - Math.sin(a) * wob;
      // (the kneeling line in front of Auren is left standing)
      if (Math.abs(x - 0.4) < 4.8 && z < -10.6 && z > -14.6) continue;
      add(t0 + d / 24, x, z, 1.6 + r() * 1.6 + d * 0.03, 0.75 + r() * 0.5, 0.25 + r() * 0.2, a + (r() - 0.5) * 0.6, 2.2);
    }
  });
  return out.sort((x, y) => x.t - y.t);
}

// ---------------------------------------------------------------------------------------------------------------------
// the shots

const SHOTS: Shot[] = [
  // EMBERS
  { at: 0, fov: 52, set: (p, c, l) => { c.set(9 - p * 2, 9 - p * 2.5, 38); l.set(0, 1.5, -6); } },
  { at: 3.4, fov: 40, set: (p, c, l, d) => { const k = d.at.kael; c.set(k.x - 2.6 + p * 0.4, 1.15, k.z - 0.4 + p * 0.3); l.set(k.x, 0.75, k.z + 0.4); } },
  { at: 6.0, fov: 46, set: (p, c, l) => { c.set(-0.1 + p * 0.4, 0.6, 4.4); l.set(-0.9, 1.0, 8.4); } },
  { at: 7.2, fov: 40, set: (p, c, l, d) => { const s = d.at.suzu; c.set(s.x + 1.6, 0.95, s.z - 2.0 + p * 0.3); l.set(s.x - 0.4, 0.5, s.z); } },
  // WHO IS THAT
  { at: 9.8, fov: 50, set: (p, c, l) => { c.set(16 - p, 2.2, -8.5); l.set(0, 1.6, -13); } },
  { at: 12.2, fov: 48, set: (_p, c, l, d) => { const k = d.at.kael; c.set(k.x + 0.9, 1.25, k.z + 3.6); l.set(k.x, 1.3, k.z - 6); } },
  { at: 15.0, fov: 44, set: (p, c, l, d) => { const k = d.at.kael; c.set(1.6 - p * 0.4, 1.95, -14.1); l.set(k.x, 1.4, k.z); } },
  // WHO ARE YOU
  { at: 17.8, fov: 38, set: (_p, c, l, d) => { const r = d.at.raigen; c.set(r.x + 0.5, 0.95, r.z - 1.5); l.set(r.x, 0.85, r.z); } },
  { at: 19.8, fov: 42, set: (_p, c, l, d) => { const g = d.at.goro; c.set(g.x + 0.8, 2.6, g.z - 2.4); l.set(g.x, 2.6, g.z); } },
  { at: 21.2, fov: 44, set: (_p, c, l, d) => { const k = d.at.kael; c.set(-2.1, 1.0, 9.7); l.set(k.x, 1.6, k.z); } },
  { at: 22.8, fov: 34, set: (p, c, l, d) => { const k = d.at.kael; c.set(k.x - 0.25, 1.66, k.z - 1.55 + p * 0.55); l.set(k.x, 1.62, k.z); } },
  // THE ORDER
  { at: 26.0, fov: 50, set: (p, c, l, d) => { const k = d.at.kael; c.set(k.x + 2.3, 0.5, k.z + 5 - p * 1.5); l.set(0, 2, -14); } },
  { at: 30.4, fov: 40, set: (p, c, l, d) => { const k = d.at.kael; c.set(k.x + 0.45, 1.15, k.z - 2.5 + p * 0.5); l.set(k.x, 1.7, k.z); } },
  // THE HOLLOW
  { at: 34.0, fov: 56, set: (p, c, l) => { c.set(15 - p * 2, 4.2, -2); l.set(0, 1, -5); } },
  { at: 35.4, fov: 52, set: (p, c, l) => { c.set(lerp(-14, 10, p), 1.8, -8.4); l.set(lerp(-12, 12, p), 1.2, -14); } },
  { at: 38.6, fov: 54, set: (p, c, l, d) => { const k = d.at.kael; c.set(2.4 - p * 0.8, 0.55, -9.4); l.set(k.x, d.kaelY() + 1.2, k.z); } },
  { at: 42.0, fov: 46, set: (p, c, l) => { c.set(-1.2 + p * 0.5, 1.6, 4.0); l.set(-2.0, 1.0, 11.5); } },
  { at: 43.4, fov: 36, set: (p, c, l, d) => { const a = d.at.auren; c.set(a.x + 0.55, 0.85, a.z + 1.55 - p * 0.3); l.set(a.x, 0.95, a.z); } },
  { at: 47.4, fov: 50, set: (_p, c, l, d) => { const k = d.at.kael; c.set(0.6, 0.85, -10.3); l.set(k.x, d.kaelY() + 1.6, k.z); } },
  { at: 49.2, fov: 58, set: (_p, c, l, d) => { const r = d.at.raigen; c.set(5.5, 1.3, r.z + 1.5); l.set(r.x, 1.1, r.z - 1); } },
  // THE CATCH
  { at: 50.0, fov: 40, set: (_p, c, l) => { c.set(3.3, 1.6, -8.7); l.set(0.3, 1.85, -8.7); } },
  { at: 51.0, fov: 40, set: (p, c, l) => { const a = 1.25 + p * 0.95; c.set(0.3 + Math.sin(a) * 3.3, 1.75, -8.7 + Math.cos(a) * 3.3); l.set(0.3, 1.75, -8.7); } },
  { at: 55.0, fov: 44, set: (_p, c, l) => { c.set(-1.6, 1.8, -7.0); l.set(0.3, 1.7, -8.7); } },
  { at: 56.4, fov: 52, set: (p, c, l) => { c.set(8 - p, 5 - p * 0.8, 4 - p); l.set(0.5, 1, -9); } },
  { at: 59.0, fov: 38, set: (p, c, l, d) => { const k = d.at.kael; c.set(k.x - 0.6, 0.95, k.z - 1.5 + p * 0.2); l.set(k.x, 0.95, k.z); } },
  // TODAY
  { at: 59.8, fov: 38, set: (_p, c, l, d) => { const r = d.at.raigen; c.set(r.x + 1.1, 0.9, r.z + 1.5); l.set(r.x, 0.6, r.z); } },
  { at: 62.0, fov: 40, set: (p, c, l, d) => { const k = d.at.kael; c.set(k.x - 1.4, 1.0, k.z + 1.4 - p * 0.3); l.set(k.x, 0.8, k.z - 0.6); } },
  { at: 64.2, fov: 50, set: (_p, c, l, d) => { const s = d.at.suzu; c.set(s.x + 0.8, 1.0, s.z + 2.6); l.set(s.x, 0.8, s.z - 6); } },
  { at: 65.8, fov: 42, set: (p, c, l, d) => { const r = d.at.raigen; c.set(r.x + 2.6 - p * 0.5, 1.3, r.z + 1.9); l.set(r.x, 0.5, r.z); } },
  { at: 68.4, fov: 55, set: (p, c, l, d) => { const r = d.at.raigen; c.set(r.x + 2 + p * 4, 1.5 + p * 12, r.z + 3 + p * 6); l.set(r.x, 0.4, r.z - p * 4); } },
];
