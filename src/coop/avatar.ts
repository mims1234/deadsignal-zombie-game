/**
 * A person in the world who is not you: another player, a soldier or a survivor. A simple figure with a name tag that
 * walks, cowers (trapped survivors, hands up) and, when killed, is thrown by the blow and falls (a light ragdoll).
 */
import * as THREE from 'three';

const UNIFORM = [0x4f6b8a, 0x8a6b4f, 0x5f8a5a];

export interface AvatarStyle {
  /** Clothing colour (defaults to a squad uniform by index). */
  color?: number;
  /** Soldiers wear a helmet and carry a rifle; survivors do not until they are freed. */
  helmet?: boolean;
  /** Second line under the name, e.g. a rank. */
  tag?: string;
  tagColor?: string;
}

function nameTag(name: string, sub: string | undefined, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = sub ? 76 : 48;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.font = '600 26px system-ui, sans-serif';
  g.strokeText(name.slice(0, 18), 128, 24, 244);
  g.fillStyle = '#e8f1e0';
  g.fillText(name.slice(0, 18), 128, 24, 244);
  if (sub) {
    g.font = '700 17px system-ui, sans-serif';
    g.lineWidth = 4;
    g.strokeText(sub, 128, 56, 244);
    g.fillStyle = color;
    g.fillText(sub, 128, 56, 244);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.5, sub ? 0.445 : 0.28, 1);
  s.position.y = sub ? 2.22 : 2.12;
  return s;
}

export class Avatar {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  /** The whole figure tips over about its feet when it falls. */
  private readonly tilt = new THREE.Group();
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly arms: THREE.Mesh[] = [];
  private readonly rifle: THREE.Mesh;
  private readonly helmet: THREE.Mesh;
  private readonly tag: THREE.Sprite;
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private tyaw = 0;
  private phase = 0;
  private placed = false;
  /** Hands up and crouched (trapped). */
  cowering = false;
  // ---- falling ----
  private down = false;
  private fallT = 0;
  private fvx = 0;
  private fvy = 0;
  private fvz = 0;
  private fallDir = 1;

  constructor(name: string, index: number, style: AvatarStyle = {}) {
    const cloth = new THREE.MeshStandardMaterial({ color: style.color ?? UNIFORM[index % UNIFORM.length], roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a183, roughness: 0.8 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // the figure faces -Z, like everything else in the game
    add(new THREE.BoxGeometry(0.46, 0.62, 0.26), cloth, 0, 1.2, 0); // torso
    add(new THREE.BoxGeometry(0.5, 0.3, 0.3), dark, 0, 1.3, 0); // vest
    add(new THREE.SphereGeometry(0.13, 12, 10), skin, 0, 1.68, 0); // head
    this.helmet = add(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 1.7, 0);
    this.helmet.visible = style.helmet !== false;
    const armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.14);
    armGeo.translate(0, -0.22, 0); // pivot at the shoulder
    for (const s of [-1, 1]) {
      const arm = add(armGeo, cloth, s * 0.3, 1.46, -0.04);
      arm.rotation.x = -0.9;
      this.arms.push(arm);
    }
    this.rifle = add(new THREE.BoxGeometry(0.07, 0.1, 0.75), dark, 0.08, 1.3, -0.48);
    this.rifle.visible = style.helmet !== false;
    const legGeo = new THREE.BoxGeometry(0.17, 0.9, 0.2);
    legGeo.translate(0, -0.45, 0);
    this.legL = add(legGeo, cloth, -0.12, 0.9, 0);
    this.legR = add(legGeo, cloth, 0.12, 0.9, 0);
    this.tag = nameTag(name, style.tag, style.tagColor ?? '#ffb060');
    this.tilt.add(this.body);
    this.root.add(this.tilt, this.tag);
    this.root.visible = false;
  }

  /** A freed survivor picks up a weapon. */
  arm(): void {
    this.rifle.visible = true;
    this.cowering = false;
  }

  /** Latest reported state. `y` is the height of the feet. */
  set(x: number, y: number, z: number, yaw: number, visible: boolean): void {
    if (this.down) return; // a body lies where it fell
    this.tx = x;
    this.ty = y;
    this.tz = z;
    this.tyaw = yaw;
    if (!this.placed || !this.root.visible) {
      this.root.position.set(x, y, z);
      this.body.rotation.y = yaw;
      this.placed = true;
    }
    this.root.visible = visible;
  }

  /** Killed: thrown along (dx, dz) at `speed` m/s, falling backwards away from the blow. */
  fall(dx: number, dz: number, speed: number): void {
    if (this.down) return;
    this.down = true;
    this.fallT = 0;
    const d = Math.hypot(dx, dz) || 1;
    this.fvx = (dx / d) * speed;
    this.fvz = (dz / d) * speed;
    this.fvy = 0.8 + speed * 0.3;
    // fall over toward the direction of travel, relative to the way the figure faces
    const fx = -Math.sin(this.body.rotation.y);
    const fz = -Math.cos(this.body.rotation.y);
    this.fallDir = fx * this.fvx + fz * this.fvz > 0 ? -1 : 1;
    // the tilt group takes over the heading so the fall happens in the figure's own frame
    this.tilt.rotation.set(0, this.body.rotation.y, 0, 'YXZ');
    this.body.rotation.y = 0;
    this.tag.visible = false;
  }

  /** On their feet again (a co-op player who came back). */
  rise(): void {
    if (!this.down) return;
    this.down = false;
    this.body.rotation.y = this.tilt.rotation.y;
    this.tilt.rotation.set(0, 0, 0);
    this.tag.visible = true;
    this.placed = false;
  }

  get fallen(): boolean {
    return this.down;
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    const p = this.root.position;
    if (this.down) {
      // ragdoll-lite: fly, bounce once, slide to a stop, tip over onto the back or the face
      this.fallT += dt;
      this.fvy -= 16 * dt;
      p.x += this.fvx * dt;
      p.z += this.fvz * dt;
      p.y = Math.max(0, p.y + this.fvy * dt);
      if (p.y === 0) {
        this.fvy = this.fvy < -3 ? -this.fvy * 0.25 : 0;
        const k = Math.exp(-6 * dt);
        this.fvx *= k;
        this.fvz *= k;
      }
      const t = Math.min(1, this.fallT / 0.55);
      this.tilt.rotation.x = this.fallDir * (Math.PI / 2 - 0.08) * t * t;
      for (const a of this.arms) a.rotation.x += (-2.4 - a.rotation.x) * Math.min(1, dt * 6);
      return;
    }
    const k = Math.min(1, dt * 12);
    const moved = Math.hypot(this.tx - p.x, this.tz - p.z);
    p.x += (this.tx - p.x) * k;
    p.y += (this.ty - p.y) * k;
    p.z += (this.tz - p.z) * k;
    let d = this.tyaw - this.body.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.body.rotation.y += d * k;
    // legs swing with distance covered; a trapped survivor crouches with the hands up
    const walking = moved > 0.02;
    this.phase += walking ? dt * 9 : 0;
    const swing = walking ? Math.sin(this.phase) * 0.6 : 0;
    const crouch = this.cowering ? 0.5 : 0;
    const ease = Math.min(1, dt * 14);
    this.legL.rotation.x += (swing + crouch - this.legL.rotation.x) * ease;
    this.legR.rotation.x += (-swing + crouch - this.legR.rotation.x) * ease;
    this.body.position.y += ((this.cowering ? -0.18 : 0) - this.body.position.y) * ease;
    const armTo = this.cowering ? -2.9 + Math.sin(this.phase + performance.now() / 300) * 0.15 : -0.9;
    for (const a of this.arms) a.rotation.x += (armTo - a.rotation.x) * ease;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}
