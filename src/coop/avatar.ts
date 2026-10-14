/** How another player looks in the world: a simple soldier figure with a rifle and a name tag. */
import * as THREE from 'three';

const UNIFORM = [0x4f6b8a, 0x8a6b4f, 0x5f8a5a];

function nameTag(name: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.font = '600 26px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(name.slice(0, 16), 128, 24, 244);
  g.fillStyle = '#e8f1e0';
  g.fillText(name.slice(0, 16), 128, 24, 244);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.5, 0.28, 1);
  s.position.y = 2.12;
  return s;
}

export class Avatar {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private tyaw = 0;
  private phase = 0;
  private placed = false;

  constructor(name: string, index: number) {
    const cloth = new THREE.MeshStandardMaterial({ color: UNIFORM[index % UNIFORM.length], roughness: 0.85 });
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
    add(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 1.7, 0); // helmet
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.5, 0.14), cloth, s * 0.3, 1.24, -0.12).rotation.x = -0.9; // arms forward
    add(new THREE.BoxGeometry(0.07, 0.1, 0.75), dark, 0.08, 1.3, -0.48); // rifle
    const legGeo = new THREE.BoxGeometry(0.17, 0.9, 0.2);
    legGeo.translate(0, -0.45, 0);
    this.legL = add(legGeo, cloth, -0.12, 0.9, 0);
    this.legR = add(legGeo, cloth, 0.12, 0.9, 0);
    this.root.add(this.body, nameTag(name));
    this.root.visible = false;
  }

  /** Latest reported state. `y` is the height of the feet. */
  set(x: number, y: number, z: number, yaw: number, visible: boolean): void {
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

  update(dt: number): void {
    if (!this.root.visible) return;
    const p = this.root.position;
    const k = Math.min(1, dt * 12);
    const moved = Math.hypot(this.tx - p.x, this.tz - p.z);
    p.x += (this.tx - p.x) * k;
    p.y += (this.ty - p.y) * k;
    p.z += (this.tz - p.z) * k;
    let d = this.tyaw - this.body.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.body.rotation.y += d * k;
    // legs swing with distance covered
    const walking = moved > 0.02;
    this.phase += walking ? dt * 9 : 0;
    const swing = walking ? Math.sin(this.phase) * 0.6 : 0;
    this.legL.rotation.x += (swing - this.legL.rotation.x) * Math.min(1, dt * 14);
    this.legR.rotation.x += (-swing - this.legR.rotation.x) * Math.min(1, dt * 14);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}
