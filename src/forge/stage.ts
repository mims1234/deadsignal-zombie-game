/**
 * The Forge's moving set pieces on this client (`runtime.ts` drives them from the story's state):
 *   the foundries  each forge's mouth (dark, catching in its ember's colour, then roaring), the hall's floor lit
 *                  in that colour while you hold it, and a light while it burns
 *   the sentry     the Hearth's gun: a turret on its plinth that turns to the story's aim, a muzzle flash and a
 *                  tracer for every shot
 *   the turning    the carrier convulsing in a red-gold glow before they are reborn
 * Nothing here decides anything.
 */
import * as THREE from 'three';
import { FORGE_SQUAD } from '../config';
import type { Game } from '../game/game';
import { ignisMaterial } from '../world/layout/ignis';
import type { FurnaceState } from './story';

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** A foundry's hall marked out on its floor while it catches: a glowing border, and the floor filling in with light. */
interface Ring {
  root: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
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
    // each foundry's hall, marked out on its floor (shown while it catches)
    for (const f of sites.furnaces) {
      const root = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const fillMat = mat.clone();
      fillMat.opacity = 0;
      const w = f.x1 - f.x0 - 0.3;
      const d = f.z1 - f.z0 - 0.3;
      const cx = (f.x0 + f.x1) / 2;
      const cz = (f.z0 + f.z1) / 2;
      const strip = (sx: number, sz: number, x: number, z: number): void => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.05, z);
        root.add(m);
      };
      strip(w, 0.16, cx, cz - d / 2);
      strip(w, 0.16, cx, cz + d / 2);
      strip(0.16, d, cx - w / 2, cz);
      strip(0.16, d, cx + w / 2, cz);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), fillMat);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(cx, 0.045, cz);
      root.add(fill);
      root.visible = false;
      g.worldRoot.add(root);
      this.rings.push({ root, mat, fillMat });
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
    this.turret.position.set(h.sentryX, h.sentryY, h.sentryZ);
    this.turret.scale.setScalar(1.3); // up on its tower it has to read from across the yard
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
    for (const r of this.rings) r.root.visible = false;
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
      const ring = this.rings[f.spot];
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
      ring.mat.color.setHex(color);
      ring.fillMat.color.setHex(color);
      const inside = p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1;
      ring.mat.opacity = inside ? 0.8 : 0.35 + 0.25 * Math.sin(clock * 4);
      // the floor fills with light as it catches
      ring.fillMat.opacity = 0.04 + 0.16 * f.progress;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (!lightAt || d < Math.hypot(p.x - lightAt.x, p.z - lightAt.z)) lightAt = { x: s.x + Math.sin(s.yaw) * 1.2, z: s.z + Math.cos(s.yaw) * 1.2, c: color, k: f.progress };
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

  /** The reborn's red-gold light, following it (null: none). The turning's light: the two never overlap. */
  rebornGlow(at: { x: number; z: number } | null, clock: number, enraged: boolean): void {
    if (!at) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 5.3) * Math.sin(clock * 1.7 + 1);
    this.glow.visible = false;
    this.glowLight.position.set(at.x, 2.4, at.z);
    this.glowLight.distance = 12;
    this.glowLight.intensity = 26 + 22 * pulse + (enraged ? 15 : 0);
  }

  /** The two lights the reveal may use (both already in the scene: adding one now would recompile everything). */
  cinemaLights(): [THREE.PointLight, THREE.PointLight] {
    return [this.furnaceLight, this.glowLight];
  }

  dispose(): void {
    for (const r of this.rings) r.root.removeFromParent();
    this.turret.removeFromParent();
    this.furnaceLight.removeFromParent();
    this.glow.removeFromParent();
    this.glowLight.removeFromParent();
  }
}
