/**
 * ZARYA: Morozko's question, as each screen sees it (`director.ts` decides it: `PARRY`). When he winds up his heavy
 * blow (the Warden body's slam, `Zombie.poseMode` 'slam' in its first 55 per cent) he asks "Are you warm?" on the
 * wire. A guard raised to him, or a swing of this player's that lands, in that pause is asked of the story as a parry
 * (`story.act('parry')`: in co-op that is the existing story request on the wire, and the simulation's director
 * decides it). While he reels, his weak points glow on his coat: solo exactly as the director has them; on a co-op
 * screen as near as the report allows (they open when he reels just after asking, one closes each time his health
 * drops, all close when he recovers).
 *
 * One draw call (six patches in one mesh, which of them shows is a uniform), and only while he reels.
 */
import * as THREE from 'three';
import type { Zombie } from '../enemies/zombie';
import type { Game } from '../game/game';
import { PARRY, WEAK_SIDE } from './director';
import { ARE_YOU_WARM } from './lines';
import { ZaryaStory, type StoryView } from './story';

/** Where each weak point sits on his coat (rig space: he faces -z, his left is -x), in the order of `WEAK_SIDE`. */
const PATCH: readonly (readonly [x: number, y: number, z: number, side: number])[] = [
  [0.02, 1.78, -0.5, 0],
  [-0.04, 1.78, 0.5, 1],
  [-0.56, 1.45, 0, 2],
  [0.56, 1.45, 0, 3],
  [-0.06, 1.15, -0.52, 0],
  [0.05, 1.18, 0.5, 1],
];

/** The part of the slam's progress that is its wind-up (`Zombie.pose`: wind-up 0..0.55). */
const WINDUP = 0.55;

const VERT = /* glsl */ `
attribute float aIdx;
uniform float uMask;
varying vec2 vUv;
varying float vOn;
void main() {
  vUv = uv * 2.0 - 1.0;
  vOn = mod(floor(uMask / exp2(aIdx) + 0.001), 2.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vOn;
void main() {
  if (vOn < 0.5) discard;
  float r = length(vUv);
  float core = smoothstep(1.0, 0.15, r);
  float rim = smoothstep(0.12, 0.0, abs(r - 0.8));
  float pulse = 0.75 + 0.25 * sin(uTime * 9.0);
  float a = (core * 0.85 + rim * 0.6) * pulse;
  if (a < 0.02) discard;
  gl_FragColor = vec4(mix(vec3(0.55, 0.85, 1.0), vec3(1.0), core * 0.6) * 1.6, a);
}`;

export class MorozkoQuestion {
  private readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  /** He is asking now; seconds since he last finished; this player has asked for a parry in this question. */
  private asking = false;
  private since = Infinity;
  private asked = false;
  private said = 0;
  private hits = 0;
  /** A co-op screen's own reckoning of the weak points: open bits, and his health when it last looked. */
  private guess = 0;
  private guessHp = 0;
  private t = 0;

  constructor(private readonly g: Game) {
    const geos: THREE.BufferGeometry[] = [];
    PATCH.forEach(([x, y, z, side], i) => {
      const q = new THREE.PlaneGeometry(0.34, 0.34);
      // each faces out of its side of the coat (a plane faces +z; the front of the coat is -z)
      q.rotateY([Math.PI, 0, -Math.PI / 2, Math.PI / 2][side]!);
      q.translate(x, y, z);
      q.setAttribute('aIdx', new THREE.Float32BufferAttribute(new Array(q.attributes.position!.count).fill(i), 1));
      geos.push(q);
    });
    const merged = mergeAll(geos);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMask: { value: 0 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(merged, this.mat);
    this.mesh.name = 'morozko-weak';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  reset(): void {
    this.asking = this.asked = false;
    this.since = Infinity;
    this.said = this.guess = this.guessHp = 0;
    this.hits = this.g.melee?.hits ?? 0;
    this.mesh.removeFromParent();
  }

  /**
   * Every frame. `m`: Morozko while he is up; `solo`: the director's own weak points (null on a co-op screen);
   * `parry`: ask the story for a parry.
   */
  update(dt: number, v: StoryView, m: Zombie | null, solo: { weak: number; reel: number } | null, parry: () => void): void {
    this.t += dt;
    const g = this.g;
    const hits = g.melee?.hits ?? 0;
    const swung = hits > this.hits;
    this.hits = hits;
    if (!m || !m.alive || m.invulnerable) {
      this.asking = false;
      this.guess = 0;
      this.show(null, 0);
      return;
    }
    const slam = m.poseMode === 'slam' && m.poseT < WINDUP;
    if (slam && !this.asking) {
      this.asking = true;
      this.asked = false;
      // said at once, over whatever else is on the wire: it is the moment to parry
      g.hud.event({ type: 'radio', speaker: 'ZIMIN', text: ARE_YOU_WARM[this.said++ % ARE_YOU_WARM.length]!, duration: 1.8, now: true });
      g.audio.play('radio_chirp', { priority: 3, volume: 0.7 });
    } else if (!slam && this.asking) {
      this.asking = false;
      this.since = 0;
    } else if (!slam) this.since += dt;

    // a guard raised to him, or a blow landed on him, in the pause
    const p = g.player;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (!this.asked && g.playerAlive() && (this.asking || this.since <= PARRY.grace * 0.8)) {
      const to = Math.atan2(-(m.x - p.x), -(m.z - p.z));
      let off = Math.abs(to - p.yaw) % (Math.PI * 2);
      if (off > Math.PI) off = Math.PI * 2 - off;
      const guard = !!g.melee?.guarding && d <= PARRY.reach - 0.5 && off < 0.9 && (this.since <= PARRY.grace * 0.8 || m.poseT >= 0.08);
      const struck = swung && d <= PARRY.reach - 0.8;
      if (guard || struck) {
        this.asked = true;
        parry();
      }
    }

    // the weak points
    let mask = 0;
    if (solo) mask = solo.reel > 0 ? solo.weak : 0;
    else {
      const reeling = m.poseMode === 'stagger';
      if (reeling && this.guess === 0 && this.since < 0.8 && this.guessHp === 0) {
        this.guess = (1 << Math.min(PARRY.weakMax, ZaryaStory.count(v.clues))) - 1;
        this.guessHp = m.hp;
      }
      if (!reeling) {
        this.guess = 0;
        this.guessHp = 0;
      } else if (this.guess && m.hp < this.guessHp - 0.5) {
        // a blow landed: whichever is open on the side this player faces closes, or the first that is
        const side = sideOf(m, p.x, p.z);
        let i = WEAK_SIDE.findIndex((s, k) => s === side && (this.guess & (1 << k)) !== 0);
        if (i < 0) i = WEAK_SIDE.findIndex((_, k) => (this.guess & (1 << k)) !== 0);
        if (i >= 0) this.guess &= ~(1 << i);
        this.guessHp = m.hp;
      }
      mask = this.guess;
    }
    this.show(mask ? m : null, mask);
  }

  private show(m: Zombie | null, mask: number): void {
    if (!m || !mask) {
      this.mesh.removeFromParent();
      return;
    }
    const root = m.rig.root;
    if (this.mesh.parent !== root) root.add(this.mesh);
    this.mat.uniforms.uMask!.value = mask;
    this.mat.uniforms.uTime!.value = this.t;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** The side of `m` that faces a point (0 front, 1 back, 2 his left, 3 his right). */
function sideOf(m: Zombie, x: number, z: number): number {
  // a blow from there travels from the point toward him
  const dir = Math.atan2(-(m.x - x), -(m.z - z));
  let a = dir - m.yaw;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  const abs = Math.abs(a);
  if (abs >= (Math.PI * 3) / 4) return 0;
  if (abs <= Math.PI / 4) return 1;
  return a < 0 ? 2 : 3;
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const aIdx: number[] = [];
  let base = 0;
  for (const q of geos) {
    const P = q.attributes.position!;
    const U = q.attributes.uv!;
    const A = q.attributes.aIdx!;
    for (let k = 0; k < P.count; k++) {
      pos.push(P.getX(k), P.getY(k), P.getZ(k));
      uv.push(U.getX(k), U.getY(k));
      aIdx.push(A.getX(k));
    }
    const I = q.index!;
    for (let k = 0; k < I.count; k++) idx.push(base + I.getX(k));
    base += P.count;
    q.dispose();
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('aIdx', new THREE.Float32BufferAttribute(aIdx, 1));
  out.setIndex(idx);
  return out;
}
