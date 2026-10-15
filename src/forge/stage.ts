/**
 * The Forge's moving set pieces on this client (`runtime.ts` drives them from the story's state):
 *   the furnaces   each drawn furnace's mouth (dark, catching in its ember's colour, then roaring), the circle you
 *                  hold while it catches, and a light while it burns
 *   the sentry     the Hearth's gun: a turret on its plinth that turns to the story's aim, a muzzle flash and a
 *                  tracer for every shot
 *   the turning    the carrier convulsing in a red-gold glow before they are reborn
 * Nothing here decides anything.
 */
import * as THREE from 'three';
import { FORGE_SQUAD, FORGE_STORY } from '../config';
import type { Game } from '../game/game';
import { ignisMaterial } from '../world/layout/ignis';
import type { FurnaceState } from './story';

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** One furnace's circle on the ground while it catches. */
interface Ring {
  root: THREE.Group;
  band: THREE.Mesh;
  fill: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
  /** The progress the inner band was last drawn at. */
  drawn: number;
}

export class ForgeStage {
  private readonly rings: Ring[] = [];
  private readonly furnaceLight: THREE.PointLight;
  private readonly turret = new THREE.Group();
  private readonly flash: THREE.Mesh;
  private flashT = 0;
  private aim = 0;
  private shotsSeen = -1;
  private readonly muzzle = new THREE.Vector3();
  private readonly glow: THREE.Mesh;
  private readonly glowLight: THREE.PointLight;
  private sparkT = 0;

  constructor(private readonly g: Game) {
    const sites = g.level.data.forge!;
    // the hold circles (one per drawn furnace; placed each run)
    for (let i = 0; i < FORGE_STORY.furnaces.count; i++) {
      const root = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const fillMat = mat.clone();
      fillMat.opacity = 0.16;
      const R = FORGE_STORY.furnaces.radius;
      const band = new THREE.Mesh(new THREE.RingGeometry(R - 0.18, R, 64), mat);
      band.rotation.x = -Math.PI / 2;
      band.position.y = 0.05;
      const fill = new THREE.Mesh(new THREE.RingGeometry(R - 0.5, R - 0.2, 64, 1, 0, Math.PI * 2), fillMat);
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.05;
      root.add(band, fill);
      root.visible = false;
      g.worldRoot.add(root);
      this.rings.push({ root, band, fill, mat, fillMat, drawn: -1 });
    }
    this.furnaceLight = new THREE.PointLight(0xff8a2a, 0, 12, 2);
    g.worldRoot.add(this.furnaceLight);
    // the sentry: a yoke and a squat armoured body with twin barrels, an ammo drum, a red eye and the Ignis mark
    const h = sites.hearth;
    const iron = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.4, metalness: 0.8 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.55, metalness: 0.5 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x220404, emissive: 0xff2a14, emissiveIntensity: 2.5 });
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    this.turret.position.set(h.sentryX, 0.9, h.sentryZ);
    add(this.turret, new THREE.CylinderGeometry(0.34, 0.4, 0.22, 14), iron, 0, 0.11, 0);
    for (const s of [-1, 1]) add(this.turret, new THREE.BoxGeometry(0.08, 0.5, 0.3), iron, s * 0.3, 0.42, 0);
    const body = new THREE.Group();
    body.position.y = 0.6;
    this.turret.add(body);
    add(body, new THREE.BoxGeometry(0.5, 0.36, 0.62), plate, 0, 0, 0);
    add(body, new THREE.BoxGeometry(0.54, 0.08, 0.5), iron, 0, 0.21, 0.04);
    for (const s of [-1, 1]) {
      add(body, new THREE.CylinderGeometry(0.045, 0.05, 0.85, 10), iron, s * 0.11, -0.02, -0.65, Math.PI / 2);
      add(body, new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), iron, s * 0.11, -0.02, -1.04, Math.PI / 2);
    }
    add(body, new THREE.CylinderGeometry(0.16, 0.16, 0.24, 14), iron, 0.32, -0.04, 0.1, 0).rotation.z = Math.PI / 2;
    add(body, new THREE.SphereGeometry(0.045, 10, 8), eyeMat, 0, 0.1, -0.32);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), ignisMaterial('lit'));
    mark.position.set(-0.26, 0.02, 0.05);
    mark.rotation.y = -Math.PI / 2;
    body.add(mark);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.position.set(0, -0.02, -1.15);
    this.flash.visible = false;
    body.add(this.flash);
    g.worldRoot.add(this.turret);
    // the turning: a burning glow around the carrier
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff4a18, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.glow.scale.set(1, 1.4, 1);
    this.glow.visible = false;
    this.glowLight = new THREE.PointLight(0xff5a20, 0, 9, 2);
    g.worldRoot.add(this.glow, this.glowLight);
  }

  /** A new run: the circles away, the sentry facing its gate. */
  reset(yaw: number): void {
    for (const r of this.rings) {
      r.root.visible = false;
      r.drawn = -1;
    }
    this.furnaceLight.intensity = 0;
    this.aim = yaw;
    this.turret.rotation.y = yaw;
    this.shotsSeen = -1;
    this.glow.visible = false;
    this.glowLight.intensity = 0;
    const fx = this.g.level.forgeFx;
    if (fx) for (const m of fx.furnaceMouths) {
      m.emissive.setHex(0xff7a1a);
      m.emissiveIntensity = 0.04;
    }
  }

  /** The furnaces as the story has them (`clock`: seconds, for the flicker). */
  furnaces(list: readonly FurnaceState[], clock: number, dt: number): void {
    const g = this.g;
    const sites = g.level.data.forge!;
    const fx = g.level.forgeFx;
    const p = g.player;
    let lightAt: { x: number; z: number; c: number; k: number } | null = null;
    list.forEach((f, i) => {
      const s = sites.furnaces[f.spot];
      const ring = this.rings[i];
      if (!s || !ring) return;
      const color = FORGE_SQUAD.flames[f.flame]?.color ?? 0xff7a1a;
      const mouth = fx?.furnaceMouths[f.spot];
      const flicker = 0.85 + 0.15 * Math.sin(clock * 13 + i) * Math.sin(clock * 7.3 + i * 2);
      if (mouth) {
        mouth.emissive.setHex(f.phase === 'cold' ? 0xff7a1a : color);
        const want = f.phase === 'cold' ? 0.18 + 0.1 * Math.sin(clock * 2 + i) : f.phase === 'burning' ? (0.6 + 2.2 * f.progress) * flicker : 3.2 * flicker;
        mouth.emissiveIntensity += (want - mouth.emissiveIntensity) * Math.min(1, dt * 5);
      }
      ring.root.visible = f.phase === 'burning';
      if (f.phase !== 'burning') return;
      ring.root.position.set(s.x, 0, s.z);
      ring.mat.color.setHex(color);
      ring.fillMat.color.setHex(color);
      const inside = Math.hypot(p.x - s.x, p.z - s.z) < FORGE_STORY.furnaces.radius;
      ring.mat.opacity = inside ? 0.75 : 0.35 + 0.2 * Math.sin(clock * 4);
      // the inner band sweeps round as it catches
      const k = Math.max(0.001, f.progress);
      if (Math.abs(k - ring.drawn) > 0.01) {
        ring.drawn = k;
        ring.fill.geometry.dispose();
        ring.fill.geometry = new THREE.RingGeometry(FORGE_STORY.furnaces.radius - 0.6, FORGE_STORY.furnaces.radius - 0.22, 48, 1, Math.PI / 2, -Math.PI * 2 * k);
      }
      ring.fillMat.opacity = 0.45;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (!lightAt || d < Math.hypot(p.x - lightAt.x, p.z - lightAt.z)) lightAt = { x: s.x - Math.sin(s.yaw) * 1.6, z: s.z - Math.cos(s.yaw) * 1.6, c: color, k: f.progress };
    });
    const L = lightAt as { x: number; z: number; c: number; k: number } | null;
    if (L) {
      this.furnaceLight.position.set(L.x, 1.1, L.z);
      this.furnaceLight.color.setHex(L.c);
      this.furnaceLight.intensity = (8 + 22 * L.k) * (0.85 + 0.15 * Math.sin(clock * 11));
    } else this.furnaceLight.intensity = 0;
  }

  /** The sentry: turn to `yaw`; play any shots fired since the last look (`shots` counts them, `tx`/`tz` the last). */
  sentry(yaw: number, shots: number, tx: number, tz: number, dt: number): void {
    const g = this.g;
    let d = yaw - this.aim;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.aim += d * Math.min(1, dt * 14);
    this.turret.rotation.y = this.aim;
    if (this.shotsSeen < 0) this.shotsSeen = shots;
    let n = (shots - this.shotsSeen + 10000) % 10000;
    this.shotsSeen = shots;
    if (n > 0 && n < 50) {
      n = Math.min(n, 2);
      this.flash.getWorldPosition(this.muzzle);
      for (let k = 0; k < n; k++) {
        const to = { x: tx + (Math.random() - 0.5) * 0.3, y: 1.1 + Math.random() * 0.4, z: tz + (Math.random() - 0.5) * 0.3 };
        g.fx.tracer(this.muzzle, to, 0xffb060);
      }
      this.flashT = 0.06;
      g.audio.play('rifle_shot', { pos: this.muzzle, volume: 0.55, rate: 1.35 + Math.random() * 0.1, priority: 1 });
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0;
  }

  /** The carrier turning at (x, z): `k` 0..1 through the warning (null: nobody is). Returns a jitter to shake them by. */
  turning(at: { x: number; z: number } | null, k: number, clock: number, dt: number): { dx: number; dz: number; yaw: number } {
    const g = this.g;
    if (!at) {
      this.glow.visible = false;
      this.glowLight.intensity = 0;
      return { dx: 0, dz: 0, yaw: 0 };
    }
    const e = smooth(k);
    const pulse = 0.5 + 0.5 * Math.sin(clock * (8 + 10 * e));
    this.glow.visible = true;
    this.glow.position.set(at.x, 1.05, at.z);
    this.glow.scale.set(0.8 + 0.5 * e, 1.2 + 0.6 * e, 0.8 + 0.5 * e);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.25 * e * pulse;
    this.glowLight.position.set(at.x, 1.5, at.z);
    this.glowLight.intensity = 10 + 40 * e * pulse;
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.22 - 0.14 * e;
      g.fx.sparkle({ x: at.x + (Math.random() - 0.5) * 0.6, y: 0.8 + Math.random() * 1.1, z: at.z + (Math.random() - 0.5) * 0.6 }, 0xff6a20, 4 + Math.round(6 * e));
    }
    const a = 0.03 + 0.09 * e;
    return { dx: (Math.random() - 0.5) * a, dz: (Math.random() - 0.5) * a, yaw: (Math.random() - 0.5) * (0.2 + 0.6 * e) };
  }

  dispose(): void {
    for (const r of this.rings) r.root.removeFromParent();
    this.turret.removeFromParent();
    this.furnaceLight.removeFromParent();
    this.glow.removeFromParent();
    this.glowLight.removeFromParent();
  }
}
