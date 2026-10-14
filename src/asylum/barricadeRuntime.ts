/**
 * The barricades in the browser: the boards on every window (one instanced mesh), boards flying off when the
 * infected rip them away, the hold-E repair prompt and its pay, and the director that brings infected in through the
 * windows (solo; in co-op the host runs the director and this only draws what it reports - see `applyBoards`).
 */
import * as THREE from 'three';
import { addCash } from '../logic/economy';
import type { InteractTarget } from '../game/interaction';
import type { GameCtx } from '../game/ctx';
import { BARRICADE } from './barricadeConfig';
import { BarricadeDirector, type BarricadeEvent } from './barricadeDirector';
import { type BarricadeDef, findBarricades, sideOf } from './barricadeLayout';
import { createPurse, payRepair, repairAll, repairBoard, resetBarricades, type RepairPurse } from './barricades';

/** The order boards go up (and come down in reverse): looks random, is the same everywhere. */
const ORDER = [2, 4, 0, 5, 1, 3];
const FLYERS = 10;

interface Flyer {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinZ: number;
  life: number;
}

export interface BarricadeRuntimeOpts {
  /** Cash multiplier for repairs (double points). */
  cashMul: () => number;
  /** True while a co-op session runs: the host owns the boards, nothing is simulated here. */
  remote: () => boolean;
}

export class BarricadeRuntime {
  readonly defs: BarricadeDef[];
  readonly director: BarricadeDirector;
  private readonly root = new THREE.Group();
  private readonly boards: THREE.InstancedMesh;
  private readonly shown: number[];
  private readonly flyers: Flyer[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private purse: RepairPurse;
  private toldTear = false;
  private readonly tilt: number[] = [];

  constructor(
    private readonly ctx: GameCtx,
    private readonly opts: BarricadeRuntimeOpts,
  ) {
    this.root.name = 'Barricades';
    ctx.worldRoot.add(this.root);
    this.defs = findBarricades(ctx.level.world, ctx.level.nav);
    this.director = new BarricadeDirector(this.defs, ctx.zombies);
    this.director.install();
    this.director.onEvent = (e) => this.onEvent(e);
    this.purse = createPurse(0);

    const geo = new THREE.BoxGeometry(1, 0.17, 0.05);
    const mat = ctx.mats.get('wood');
    this.boards = new THREE.InstancedMesh(geo, mat, Math.max(1, this.defs.length * BARRICADE.boards));
    this.boards.castShadow = true;
    this.boards.receiveShadow = true;
    this.boards.frustumCulled = false;
    this.root.add(this.boards);
    // a fixed, slightly crooked angle per board
    let s = 1961;
    for (let i = 0; i < this.defs.length * BARRICADE.boards; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      this.tilt.push(((s / 4294967296) * 2 - 1) * 0.16 + (i % 2 ? 0.1 : -0.1));
    }
    this.shown = this.defs.map(() => -1);
    for (let i = 0; i < FLYERS; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.castShadow = true;
      this.root.add(m);
      this.flyers.push({ mesh: m, vx: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0, life: 0 });
    }
    this.sync(true);
  }

  /** Board counts per window (the co-op snapshot carries these; a guest applies the host's with `applyBoards`). */
  get state(): readonly number[] {
    return this.director.state.boards;
  }

  /** Co-op guest: take the host's board counts (boards that disappear fly off). */
  applyBoards(boards: readonly number[]): void {
    const st = this.director.state.boards;
    for (let i = 0; i < st.length && i < boards.length; i++) {
      const b = Math.max(0, Math.min(BARRICADE.boards, Math.round(boards[i]!)));
      if (b < st[i]!) for (let k = st[i]! - 1; k >= b; k--) this.fling(i, k, this.defs[i]!.outX, this.defs[i]!.outZ);
      st[i] = b;
    }
  }

  reset(): void {
    this.director.reset();
    resetBarricades(this.director.state);
    this.purse = createPurse(this.ctx.time);
    this.toldTear = false;
    for (const f of this.flyers) {
      f.life = 0;
      f.mesh.visible = false;
    }
    this.sync(true);
  }

  /** Board up every window (the Carpenter). Returns the boards that went back up. */
  repairEverything(): number {
    const n = repairAll(this.director.state);
    for (const d of this.defs) this.ctx.fx.dust({ x: d.x, y: d.sill + 0.8, z: d.z }, 0.6);
    return n;
  }

  /** Any window missing boards? (the Carpenter only drops when there is something to fix) */
  get damaged(): boolean {
    return this.director.state.boards.some((b) => b < BARRICADE.boards);
  }

  update(dt: number): void {
    this.director.enabled = !this.opts.remote();
    this.director.update();
    this.sync(false);
    // flying boards: thrown, spinning, bouncing once on the ground, gone after a few seconds
    for (const f of this.flyers) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const m = f.mesh;
      f.vy -= 14 * dt;
      m.position.x += f.vx * dt;
      m.position.y += f.vy * dt;
      m.position.z += f.vz * dt;
      m.rotation.x += f.spinX * dt;
      m.rotation.z += f.spinZ * dt;
      if (m.position.y < 0.05) {
        m.position.y = 0.05;
        f.vy = Math.abs(f.vy) * 0.25;
        f.vx *= 0.5;
        f.vz *= 0.5;
        f.spinX *= 0.4;
        f.spinZ *= 0.4;
      }
      if (f.life <= 0) m.visible = false;
    }
  }

  /** The repair prompt for the window the player is at (inside, close, facing it), if it is missing boards. */
  target(): InteractTarget | null {
    if (this.opts.remote()) return null; // co-op repairs go through the host (wired with the co-op sync)
    const p = this.ctx.player;
    let best: BarricadeDef | null = null;
    let bestD = Infinity;
    for (const d of this.defs) {
      const side = sideOf(d, p.x, p.z);
      if (side > -0.1 || side < -BARRICADE.repairReach) continue;
      const dist = Math.hypot(p.x - d.x, p.z - d.z);
      if (dist > BARRICADE.repairReach + 0.3 || dist >= bestD) continue;
      if (this.director.state.boards[d.id]! >= BARRICADE.boards) continue;
      best = d;
      bestD = dist;
    }
    if (!best) return null;
    const d = best;
    const left = this.director.state.boards[d.id]!;
    const broke = this.purse.credit + (this.ctx.time - this.purse.at) * (BARRICADE.payCap / BARRICADE.payWindow) < 1;
    return {
      id: `barricade:${d.id}`,
      dist: bestD - 0.5, // ahead of a crate or station in the same reach: you are at a window
      text: 'REPAIR BARRICADE',
      sub: `${left}/${BARRICADE.boards} boards  //  ${broke ? 'no pay for a while - keep them out anyway' : `+$${BARRICADE.repairPay * this.opts.cashMul()} a board`}`,
      tone: left === 0 ? 'danger' : 'warn',
      hold: BARRICADE.repairTime,
      repeat: true,
      enabled: true,
      onUse: () => this.repair(d.id),
    };
  }

  /** Nail one board back on window `i` and pay for it. */
  repair(i: number): boolean {
    const ctx = this.ctx;
    if (!repairBoard(this.director.state, i)) return false;
    const d = this.defs[i]!;
    const cash = payRepair(this.purse, ctx.time, this.opts.cashMul());
    if (cash > 0) {
      addCash(ctx.session.inv, cash);
      ctx.hudEvent({ type: 'cash', amount: cash });
    }
    const k = ORDER[this.director.state.boards[i]! - 1]!;
    const y = d.sill + 0.16 + k * ((d.top - d.sill - 0.3) / (BARRICADE.boards - 1));
    ctx.audio.play('board_hammer', { pos: { x: d.x, y, z: d.z }, priority: 2, rate: 0.95 + ctx.rng.f() * 0.1 });
    ctx.fx.dust({ x: d.x + d.nx * 0.3, y, z: d.z + d.nz * 0.3 }, 0.25);
    return true;
  }

  dispose(): void {
    this.director.uninstall();
    this.root.removeFromParent();
    this.boards.dispose();
  }

  // ---------------------------------------------------------------------------------------------

  private onEvent(e: BarricadeEvent): void {
    if (e.kind !== 'tear') return;
    this.fling(e.window, ORDER[e.boards]!, e.x, e.z);
    if (!this.toldTear && !this.opts.remote()) {
      this.toldTear = true;
      this.ctx.radio('OKAFOR', 'They are pulling the boards off the windows - that is how they got into the wards the first time. Hold E at a window to nail them back.', 6);
    }
  }

  /** Board `k` of window `w` comes off, thrown out past the infected at (fromX, fromZ). */
  private fling(w: number, k: number, fromX: number, fromZ: number): void {
    const f = this.flyers.find((q) => q.life <= 0) ?? this.flyers[0]!;
    const d = this.defs[w]!;
    this.place(f.mesh, d, k);
    f.mesh.visible = true;
    const r = this.ctx.rng;
    // away from the window, a little to one side of the one that tore it
    const side = (r.f() - 0.5) * 2.4 + Math.sign((fromX - d.x) * d.ax + (fromZ - d.z) * d.az) * 0.8;
    f.vx = d.nx * (2.4 + r.f() * 1.6) + d.ax * side;
    f.vz = d.nz * (2.4 + r.f() * 1.6) + d.az * side;
    f.vy = 2 + r.f() * 2;
    f.spinX = (r.f() - 0.5) * 14;
    f.spinZ = (r.f() - 0.5) * 18;
    f.life = 3.5;
    this.ctx.fx.dust({ x: f.mesh.position.x, y: f.mesh.position.y, z: f.mesh.position.z }, 0.4);
  }

  /** Board `k`'s place across window `d` (on the outside face, slightly crooked). */
  private place(o: THREE.Object3D, d: BarricadeDef, k: number): void {
    const n = BARRICADE.boards;
    const y = d.sill + 0.16 + k * ((d.top - d.sill - 0.3) / (n - 1));
    const out = d.thick / 2 + 0.035 + (k % 2) * 0.025;
    o.position.set(d.x + d.nx * out, y, d.z + d.nz * out);
    o.rotation.set(0, d.rot, this.tilt[d.id * n + k]!, 'YXZ');
    o.scale.set(d.width + 0.34, 1, 1);
  }

  /** Bring the instanced boards in line with the board counts (only windows that changed). */
  private sync(all: boolean): void {
    const st = this.director.state.boards;
    let dirty = false;
    for (let w = 0; w < this.defs.length; w++) {
      const b = st[w]!;
      if (!all && this.shown[w] === b) continue;
      this.shown[w] = b;
      dirty = true;
      const d = this.defs[w]!;
      for (let j = 0; j < BARRICADE.boards; j++) {
        const k = ORDER[j]!;
        const idx = w * BARRICADE.boards + k;
        if (j < b) {
          this.place(this.dummy, d, k);
          this.dummy.updateMatrix();
          this.boards.setMatrixAt(idx, this.dummy.matrix);
        } else {
          this.boards.setMatrixAt(idx, this.hidden);
        }
      }
    }
    if (dirty) this.boards.instanceMatrix.needsUpdate = true;
  }
}
