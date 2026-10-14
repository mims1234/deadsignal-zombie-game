/**
 * The Asylum's day and night, drawn: blends the sky dome, the fog, the hemisphere / key / fill lights, the
 * environment and the exposure between four looks (an overcast late afternoon, the sunset, the moonlit night and first
 * light), swings the key light from the sun to the moon, and switches the outdoor lamps (their pooled lights, glow
 * sprites and ground pools) off by day and on, one by one, at dusk.
 *
 * Cheap on every preset: a handful of colours and uniforms per frame, and the lamp buffers are only rewritten while a
 * lamp is actually changing (the few seconds it flickers on). The hour itself comes from `logic/timeOfDay.ts`.
 */
import * as THREE from 'three';
import { RENDER } from '../config';
import { MOON_DIR, type TimeOfDay } from '../logic/timeOfDay';
import type { Level } from '../world/level';
import type { GameRenderer } from './renderer';
import { BLUE_HOUR } from './stage';

interface LookDef {
  zenith: number;
  mid: number;
  horizon: number;
  glow: number;
  haze: number;
  fog: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  keyColor: number;
  key: number;
  fillColor: number;
  fill: number;
  env: number;
  /** Interiors relative to the night's (daylight through the windows). */
  indoor: number;
  exposure: number;
  stars: number;
  /** Sun / moon disc colour (premultiplied brightness). */
  disc: number;
  discK: number;
  viewHemi: number;
  viewSun: number;
}

/** The night: exactly the Asylum's moonlit look (game.ts sets its fog / hemisphere / fill colours at build time). */
const NIGHT: LookDef = {
  zenith: BLUE_HOUR.zenith,
  mid: BLUE_HOUR.midSky,
  horizon: BLUE_HOUR.horizon,
  glow: BLUE_HOUR.glow,
  haze: BLUE_HOUR.fog,
  fog: 0x141c1c,
  fogDensity: RENDER.fogDensity,
  hemiSky: 0x7d8fa0,
  hemiGround: 0x141a12,
  hemi: 4.4,
  keyColor: BLUE_HOUR.moonColor,
  key: 4.2,
  fillColor: 0x9fb6d0,
  fill: 1.1,
  env: 0.5,
  indoor: 1,
  exposure: RENDER.exposure,
  stars: 1,
  disc: BLUE_HOUR.moonColor,
  discK: 1,
  viewHemi: 0x7fa0cc,
  viewSun: 0xb7cdf0,
};

/** Late afternoon under a low, pale overcast: flat grey light, a washed-out sun, mist in the pines. */
const DAY: LookDef = {
  zenith: 0x74838f,
  mid: 0x95a1aa,
  horizon: 0xbcc2c0,
  glow: 0xe2c7a0,
  haze: 0xa4aaa7,
  fog: 0x949b98,
  fogDensity: 0.0112,
  hemiSky: 0xd6dde2,
  hemiGround: 0x5e614f,
  hemi: 3.3,
  keyColor: 0xfff0dc,
  key: 2.7,
  fillColor: 0xc5ced6,
  fill: 0.7,
  env: 1.1,
  indoor: 1.7,
  exposure: 0.95,
  stars: 0,
  disc: 0xfff3e0,
  discK: 0.35,
  viewHemi: 0xc9d1d6,
  viewSun: 0xfff0dc,
};

/** The sun on the pines: a bruised sky, copper light, long shadows. */
const SUNSET: LookDef = {
  zenith: 0x2a3550,
  mid: 0x5b5670,
  horizon: 0xc98a62,
  glow: 0xff8a4a,
  haze: 0x7a5a50,
  fog: 0x4a3c3a,
  fogDensity: 0.0112,
  hemiSky: 0x9c8c98,
  hemiGround: 0x2a2219,
  hemi: 3.5,
  keyColor: 0xffa060,
  key: 2.6,
  fillColor: 0xff9a66,
  fill: 1.3,
  env: 0.8,
  indoor: 1.25,
  exposure: 1.05,
  stars: 0.15,
  disc: 0xffb070,
  discK: 0.9,
  viewHemi: 0xb09aa0,
  viewSun: 0xffb070,
};

/** First light: rose and grey over the gatehouse, the fog lifting. */
const DAWN: LookDef = {
  zenith: 0x4a5a7a,
  mid: 0x8a8ea8,
  horizon: 0xe6b49a,
  glow: 0xffb488,
  haze: 0x9a8c90,
  fog: 0x7c767c,
  fogDensity: 0.011,
  hemiSky: 0xb8b8cc,
  hemiGround: 0x3a342c,
  hemi: 3.5,
  keyColor: 0xffc8a0,
  key: 2.5,
  fillColor: 0xffb090,
  fill: 1.0,
  env: 0.9,
  indoor: 1.3,
  exposure: 1.0,
  stars: 0.1,
  disc: 0xffd0a0,
  discK: 0.8,
  viewHemi: 0xb8b8cc,
  viewSun: 0xffc8a0,
};

type ColorKey = 'zenith' | 'mid' | 'horizon' | 'glow' | 'haze' | 'fog' | 'hemiSky' | 'hemiGround' | 'keyColor' | 'fillColor' | 'disc' | 'viewHemi' | 'viewSun';
type NumKey = 'fogDensity' | 'hemi' | 'key' | 'fill' | 'env' | 'indoor' | 'exposure' | 'stars' | 'discK';
const COLOR_KEYS: ColorKey[] = ['zenith', 'mid', 'horizon', 'glow', 'haze', 'fog', 'hemiSky', 'hemiGround', 'keyColor', 'fillColor', 'disc', 'viewHemi', 'viewSun'];
const NUM_KEYS: NumKey[] = ['fogDensity', 'hemi', 'key', 'fill', 'env', 'indoor', 'exposure', 'stars', 'discK'];

type Look = Record<ColorKey, THREE.Color> & Record<NumKey, number>;

function toLook(d: LookDef): Look {
  const l = {} as Look;
  for (const k of COLOR_KEYS) l[k] = new THREE.Color(d[k]);
  for (const k of NUM_KEYS) l[k] = d[k];
  return l;
}

function mixLook(out: Look, a: Look, b: Look, t: number): void {
  for (const k of COLOR_KEYS) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
}

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const hash = (n: number): number => {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
};

export class DayNightLook {
  private readonly looks = { day: toLook(DAY), sunset: toLook(SUNSET), night: toLook(NIGHT), dawn: toLook(DAWN) };
  private readonly cur = toLook(NIGHT);
  private readonly glowSet = BLUE_HOUR.glowDir.clone().normalize();
  private readonly glowRise = new THREE.Vector3(-BLUE_HOUR.glowDir.x, BLUE_HOUR.glowDir.y, -BLUE_HOUR.glowDir.z).normalize();
  private readonly moonDir = new THREE.Vector3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z);
  private readonly tmp = new THREE.Vector3();
  /** Lamps with open sky above them (street lamps, the clock face, yard lights), by index into `level.lights`. */
  private readonly outdoor: number[] = [];
  private readonly gains: Float32Array;
  /** Per outdoor lamp: where in dusk it comes on, and where in dawn it goes out (0..1). */
  private readonly onAt: number[] = [];
  private readonly offAt: number[] = [];
  /** Glow sprites and ground pools that belong to an outdoor lamp: [lamp index, first float in the colour buffer]. */
  private readonly glowSlots: [number, number][] = [];
  private readonly poolSlots: [number, number][] = [];
  private glowBase: Float32Array | null = null;
  private poolBase: Float32Array | null = null;
  private poolAttr: THREE.BufferAttribute | null = null;
  private lastSig = '';

  constructor(
    private readonly renderer: GameRenderer,
    private readonly level: Level,
  ) {
    const lights = level.lights;
    this.gains = new Float32Array(lights.length).fill(1);
    const world = level.world;
    const posKey = (x: number, y: number, z: number): string => `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    const byPos = new Map<string, number>();
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!;
      const roof = world.raycast(l.x, l.y - 0.25, l.z, 0, 1, 0, 30, 'shots');
      if (roof) continue;
      this.outdoor.push(i);
      this.onAt.push(0.12 + 0.6 * hash(i));
      this.offAt.push(0.45 + 0.45 * hash(i + 31));
      byPos.set(posKey(l.x, l.y, l.z), i);
    }
    // glow sprites registered with a lamp sit exactly at it
    const gf = level.glowField;
    if (gf) {
      const geo = gf.points.geometry;
      const attr = geo.getAttribute('aColor') as THREE.BufferAttribute;
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let g = 0; g < pos.count; g++) {
        const i = byPos.get(posKey(pos.getX(g), pos.getY(g), pos.getZ(g)));
        if (i !== undefined) this.glowSlots.push([i, g * 3]);
      }
      if (this.glowSlots.length > 0) this.glowBase = Float32Array.from(attr.array as Float32Array);
    }
    // ground pools: one quad (four vertices) per lamp with a pool, in lamp order (see LevelBuilder.finalize)
    const pools = level.root.getObjectByName('LightPools') as THREE.Mesh | undefined;
    if (pools) {
      this.poolAttr = pools.geometry.getAttribute('color') as THREE.BufferAttribute;
      let q = 0;
      for (let i = 0; i < lights.length; i++) {
        if (!((lights[i]!.pool ?? 0) > 0)) continue;
        if (byPos.has(posKey(lights[i]!.x, lights[i]!.y, lights[i]!.z))) this.poolSlots.push([i, q * 12]);
        q++;
      }
      this.poolBase = Float32Array.from(this.poolAttr.array as Float32Array);
    }
    renderer.lightPool.lampGain = this.gains;
  }

  /** Draw this hour. `time`: the render clock (lamp flicker while they strike). */
  apply(tod: TimeOfDay, time: number): void {
    const L = this.looks;
    const cur = this.cur;
    let glowDir = this.glowSet;
    switch (tod.phase) {
      case 'day':
        mixLook(cur, L.day, L.day, 0);
        break;
      case 'dusk':
        if (tod.t < 0.5) mixLook(cur, L.day, L.sunset, smooth(tod.t / 0.5));
        else mixLook(cur, L.sunset, L.night, smooth((tod.t - 0.5) / 0.5));
        break;
      case 'night':
        mixLook(cur, L.night, L.night, 0);
        break;
      case 'dawn':
        mixLook(cur, L.night, L.dawn, smooth(tod.t));
        glowDir = this.glowRise;
        break;
    }
    const r = this.renderer;
    // ---- sky ----
    const u = r.sky.userData.uniforms;
    (u.uZenith!.value as THREE.Color).copy(cur.zenith);
    (u.uMid!.value as THREE.Color).copy(cur.mid);
    (u.uHorizon!.value as THREE.Color).copy(cur.horizon);
    (u.uGlow!.value as THREE.Color).copy(cur.glow);
    (u.uHazeColor!.value as THREE.Color).copy(cur.haze);
    (u.uGlowDir!.value as THREE.Vector3).copy(glowDir);
    if (u.uStars) u.uStars.value = cur.stars;
    // the key light is the sun while it is up, the moon once it is down; the swap happens while it is faint
    const sunUp = tod.sun >= 0.5;
    const key = sunUp ? this.tmp.set(tod.sunDir.x, Math.max(0.06, tod.sunDir.y), tod.sunDir.z).normalize() : this.moonDir;
    const keyGain = Math.max(0.12, smooth(Math.abs(tod.sun - 0.5) * 2));
    (u.uMoonDir!.value as THREE.Vector3).copy(sunUp ? this.tmp.set(tod.sunDir.x, tod.sunDir.y, tod.sunDir.z).normalize() : this.moonDir);
    (u.uMoonColor!.value as THREE.Color).copy(cur.disc).multiplyScalar(cur.discK);
    r.light.keyDir.copy(key);
    // ---- fog, lights, exposure ----
    const fog = r.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(cur.fog);
      fog.density = cur.fogDensity;
    }
    r.light.hemi.color.copy(cur.hemiSky);
    r.light.hemi.groundColor.copy(cur.hemiGround);
    r.light.moon.color.copy(cur.keyColor);
    r.light.fill.color.copy(cur.fillColor);
    r.light.fill.position.copy(glowDir).multiplyScalar(50);
    r.viewHemi.color.copy(cur.viewHemi);
    r.viewSun.color.copy(cur.viewSun);
    r.setSkyLevels({ hemi: cur.hemi, key: cur.key * keyGain, fill: cur.fill, env: cur.env, indoor: cur.indoor });
    r.renderer.toneMappingExposure = cur.exposure;
    // ---- lamps ----
    this.applyLamps(tod, time);
  }

  private applyLamps(tod: TimeOfDay, time: number): void {
    const g = this.gains;
    let sig = '';
    for (let k = 0; k < this.outdoor.length; k++) {
      const i = this.outdoor[k]!;
      let v: number;
      if (tod.phase === 'day') v = 0;
      else if (tod.phase === 'night') v = 1;
      else if (tod.phase === 'dusk') {
        const since = tod.t - this.onAt[k]!;
        // a sodium lamp strikes: a few stuttering blinks, then it holds
        v = since < 0 ? 0 : since > 0.09 ? 1 : hash(Math.floor(time * 18) + i) > 0.45 ? 0.8 : 0.08;
      } else v = tod.t > this.offAt[k]! ? 0 : 1;
      if (g[i] !== v) {
        g[i] = v;
        sig = 'x';
      }
    }
    if (sig === '' && this.lastSig !== '') return;
    this.lastSig = 'set';
    this.writeBuffers();
  }

  /** Scale the outdoor lamps' glow sprites and ground pools by their gains. */
  private writeBuffers(): void {
    const g = this.gains;
    const gf = this.level.glowField;
    if (gf && this.glowBase) {
      const attr = gf.points.geometry.getAttribute('aColor') as THREE.BufferAttribute;
      const a = attr.array as Float32Array;
      for (const [i, o] of this.glowSlots) for (let c = 0; c < 3; c++) a[o + c] = this.glowBase[o + c]! * g[i]!;
      attr.needsUpdate = true;
    }
    if (this.poolAttr && this.poolBase) {
      const a = this.poolAttr.array as Float32Array;
      for (const [i, o] of this.poolSlots) for (let c = 0; c < 12; c++) a[o + c] = this.poolBase[o + c]! * g[i]!;
      this.poolAttr.needsUpdate = true;
    }
  }

  /** Back to the plain night (every lamp on). */
  dispose(): void {
    this.gains.fill(1);
    this.writeBuffers();
    if (this.renderer.lightPool.lampGain === this.gains) this.renderer.lightPool.lampGain = null;
  }
}
