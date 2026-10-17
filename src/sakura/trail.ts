/**
 * The petal trail: glowing petals on the ground that stream from the player toward wherever the story wants them next,
 * along the way the infected walk (the navigation grid, round walls and through doors), down the right stairwell when
 * the goal is on another floor, and a pillar of light over the goal itself. Nobody has to read a map mid-fight: follow
 * the petals.
 *
 * The way is a flow field toward the goal (or toward the stairs out of this floor), built a slice at a time over a few
 * frames so it never hitches, then walked downhill from the player every frame (cheap) for the petals.
 */
import * as THREE from 'three';
import type { Level } from '../world/level';
import { FlowField, NAV_CELL, type NavGrid, UNREACHABLE } from '../world/nav';
import { petalTexture } from './petalFall';

export interface RouteGoal {
  x: number;
  z: number;
  /** Floor height (the beacon stands on it). */
  y: number;
  /** The floors area it is in. */
  area: number;
}

/** Petals on the trail, the gap between them (m), and how far ahead it shows. */
const PETALS = 44;
const GAP = 1.7;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export class RouteTrail {
  private readonly mesh: THREE.Points;
  private readonly pos = new Float32Array(PETALS * 3);
  private readonly scale = new Float32Array(PETALS);
  private readonly beacon: THREE.Mesh;
  private goal: RouteGoal | null = null;
  /** The field toward the current sub-goal (the goal, or the stairs out of this floor). */
  private field: FlowField | null = null;
  private nav: NavGrid | null = null;
  private key = '';
  private ready = false;
  private readonly pts: { x: number; z: number }[] = [];

  constructor(
    private readonly level: Level,
    parent: THREE.Object3D,
  ) {
    // petals that always face the camera, hovering over the ground: solid pink with a bright core, so they read on
    // pale pavement in daylight as well as in the dark
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(this.scale, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: petalTexture() }, color: { value: new THREE.Color(0xff4f9a) }, size: { value: 0.7 }, scaleK: { value: 420 } },
      vertexShader:
        'attribute float aScale; uniform float size; uniform float scaleK; varying float vS; void main(){ vS = aScale; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * aScale * scaleK / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader:
        'uniform sampler2D map; uniform vec3 color; varying float vS; void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a < 0.3) discard; float core = 1.0 - smoothstep(0.0, 0.45, distance(gl_PointCoord, vec2(0.5))); gl_FragColor = vec4(mix(color, vec3(1.0, 0.92, 0.96), core * 0.7), min(1.0, 0.55 + vS * 0.45)); }',
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'RouteTrail';
    parent.add(this.mesh);
    // the pillar of light over the goal: bright at the foot, fading up into the sky
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xff9ec8) } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float time; uniform vec3 color; varying float vY; void main(){ float a = (1.0 - vY) * (0.55 + 0.25 * sin(time * 2.4)); gl_FragColor = vec4(color * a, a); }',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 60, 16, 1, true).translate(0, 30, 0), beamMat);
    this.beacon.frustumCulled = false;
    this.beacon.visible = false;
    this.beacon.name = 'RouteBeacon';
    parent.add(this.beacon);
  }

  /** Where to lead (null: nowhere, the trail goes). */
  set(goal: RouteGoal | null): void {
    if (goal && this.goal && goal.area === this.goal.area && Math.hypot(goal.x - this.goal.x, goal.z - this.goal.z) < 0.5) return;
    this.goal = goal;
  }

  update(dt: number, time: number, px: number, py: number, pz: number): void {
    void dt;
    const g = this.goal;
    const fl = this.level.floors;
    if (!g) {
      this.mesh.geometry.setDrawRange(0, 0);
      this.beacon.visible = false;
      return;
    }
    const area = fl.areaAt(px, py, pz);
    // the beacon, on the goal's floor
    this.beacon.visible = area === g.area;
    this.beacon.position.set(g.x, g.y, g.z);
    (this.beacon.material as THREE.ShaderMaterial).uniforms.time!.value = time;
    // the sub-goal on this floor: the goal itself, or the end of the way out toward it
    let sx = g.x;
    let sz = g.z;
    if (area !== g.area) {
      const link = fl.route(area, g.area);
      if (!link) {
        this.mesh.geometry.setDrawRange(0, 0);
        return;
      }
      const e = fl.endIn(link, area);
      sx = e.x;
      sz = e.z;
    }
    const key = `${area}:${Math.round(sx * 2)}:${Math.round(sz * 2)}`;
    if (key !== this.key) {
      this.key = key;
      this.nav = fl.navOf(area);
      this.field = new FlowField(this.nav);
      this.ready = false;
      if (!this.field.begin(sx, sz, Infinity)) this.field = null;
    }
    if (!this.field || !this.nav) {
      this.mesh.geometry.setDrawRange(0, 0);
      return;
    }
    if (!this.ready) {
      this.ready = this.field.advance(3);
      if (!this.ready) return;
    }
    this.walk(px, pz, sx, sz);
    this.draw(time, area, py);
  }

  /** Downhill through the field from the player, a point every GAP metres. */
  private walk(px: number, pz: number, sx: number, sz: number): void {
    const nav = this.nav!;
    const dist = this.field!.dist;
    const pts = this.pts;
    pts.length = 0;
    let cur = nav.index(px, pz);
    if (cur < 0 || nav.blocked[cur] === 1) cur = nav.nearestFree(px, pz, 4);
    if (cur < 0 || dist[cur] === UNREACHABLE) return;
    const cols = nav.cols;
    const per = Math.max(1, Math.round(GAP / NAV_CELL));
    // start a little ahead of the player's feet
    for (let step = 0, since = per - 1; step < PETALS * per * 2 && pts.length < PETALS; step++) {
      const ix = cur % cols;
      const iz = (cur - ix) / cols;
      let best = -1;
      let bestD = dist[cur]!;
      for (let k = 0; k < 8; k++) {
        const nx = ix + DX[k]!;
        const nz = iz + DZ[k]!;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= nav.rows) continue;
        const n = nz * cols + nx;
        if (dist[n]! < bestD) {
          bestD = dist[n]!;
          best = n;
        }
      }
      if (best < 0) break;
      cur = best;
      if (++since >= per) {
        since = 0;
        pts.push({ x: nav.cellCenterX(cur), z: nav.cellCenterZ(cur) });
      }
    }
    if (pts.length < PETALS && Math.hypot(sx - px, sz - pz) > 1) pts.push({ x: sx, z: sz });
  }

  /** The petals along the points: a wave running down the trail toward the goal. */
  private draw(time: number, area: number, py: number): void {
    const pts = this.pts;
    const fl = this.level.floors;
    const baseY = fl.areas[area]?.y ?? 0;
    const world = this.level.world;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      // over the ground under it (steps, kerbs), never above the player's own floor by much
      const y = Math.max(baseY, world.groundHeight(p.x, p.z, 0.1, Math.max(baseY, py) + 0.6));
      // a wave running down the trail toward the goal; the first few fade in at the player's feet
      const wave = 0.5 + 0.5 * Math.sin(time * 5 - i * 0.55);
      const fade = Math.min(1, (i + 1) / 3) * (1 - i / (PETALS + 6));
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = y + 0.3 + wave * 0.12;
      this.pos[i * 3 + 2] = p.z;
      this.scale[i] = (0.6 + wave * 0.55) * fade;
    }
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, pts.length);
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.aScale!.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.beacon.removeFromParent();
    this.mesh.geometry.dispose();
    this.beacon.geometry.dispose();
  }
}
