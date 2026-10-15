/**
 * The reborn's own look, nothing like the Infernus: not a plated brute but the member who hid the bite - one of the
 * Forge's burned clan bodies, grown to the Infernus's height - with the fire breaking out of them. Two great phoenix
 * wings of flame open from their back and beat slowly (wide open when it roars, swept back when it charges), a crown
 * of flame burns over the head, and a red-gold glow pulses around them so it reads from across the Forge (its light is
 * the stage's, `stage.ts`: a light added at runtime would recompile every material in the scene).
 *
 * A `ZombieRig` wrapping one of the factory's Forge bodies: the body animates as usual (every mode the Warden uses),
 * everything here rides on top. Client only (the simulation's infected have no looks).
 */
import * as THREE from 'three';
import { ZOMBIES } from '../config';
import type { ZombieFactory, ZombieAnimState, ZombieRig } from '../enemies/zombieRigTypes';

/** The Forge body grown to the Infernus's height. */
const S = (ZOMBIES.warden.height / ZOMBIES.runner.height) * 1.04;

const flameMats = new Map<string, THREE.MeshBasicMaterial>();
/** Additive flame, shared by every reborn (never disposed); `own` makes one for this figure alone. */
function flameMat(color: number, opacity: number, own = false): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}`;
  let m = own ? undefined : flameMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    if (!own) flameMats.set(key, m);
  }
  return m;
}

/**
 * The wings', crown's and halo's shapes, shared by every reborn and never disposed: the one built while the level loads
 * (and drawn once, off screen) has already sent them to the GPU, so the reborn's first appearance builds nothing.
 */
const shapes = new Map<string, THREE.BufferGeometry>();
function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = shapes.get(key);
  if (!g) {
    g = make();
    shapes.set(key, g);
  }
  return g;
}

/** A feather of flame: a long flat leaf, its base at the origin, pointing along +Y. */
function feather(len: number, width: number): THREE.BufferGeometry {
  return shared(`f${len.toFixed(3)}|${width}`, () => featherShape(len, width));
}

function featherShape(len: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width, len * 0.35, width * 0.25, len);
  shape.quadraticCurveTo(-width * 0.4, len * 0.45, 0, 0);
  return new THREE.ShapeGeometry(shape, 6);
}

/** One wing (mirrored by `side`): a fan of feathers in three layers, white-gold at the root to deep red at the tips. */
function wing(side: number): THREE.Group {
  const g = new THREE.Group();
  const layers: [number, number, number, THREE.Material][] = [
    [1.0, 0.24, 9, flameMat(0xff3a10, 0.5)],
    [0.78, 0.2, 8, flameMat(0xff8a2a, 0.6)],
    [0.5, 0.16, 6, flameMat(0xffe0a0, 0.7)],
  ];
  for (const [len, w, n, m] of layers) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const geo = feather(len * (0.75 + 0.35 * Math.sin(t * Math.PI)), w);
      const f = new THREE.Mesh(geo, m);
      // fanned out from straight up to sweeping down and out
      f.rotation.z = -side * (0.15 + t * 1.75);
      f.position.z = 0.01 * i;
      f.renderOrder = 3;
      g.add(f);
    }
  }
  return g;
}

export function createRebornRig(factory: ZombieFactory, seed: number): ZombieRig {
  const body = factory.create('runner', seed, 'forge');
  const root = new THREE.Group();
  root.name = 'Zombie:reborn';
  body.root.scale.setScalar(S);
  root.add(body.root);
  // the wings, from between the shoulder blades
  const back = new THREE.Group();
  back.position.set(0, 1.42 * S, 0.16 * S);
  root.add(back);
  const wings = [-1, 1].map((side) => {
    const w = wing(side);
    w.scale.setScalar(1.55);
    w.position.x = side * 0.08;
    back.add(w);
    return w;
  });
  // the crown of flame, riding the head
  const crown = new THREE.Group();
  const crownMat = flameMat(0xffb040, 0.85);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const geo = shared(`c${i % 2}`, () => new THREE.ConeGeometry(0.035, 0.16 + (i % 2) * 0.09, 5, 1, true));
    const c = new THREE.Mesh(geo, crownMat);
    c.position.set(Math.cos(a) * 0.1, 0.13, Math.sin(a) * 0.1);
    c.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    crown.add(c);
  }
  body.headAttach?.(crown);
  // the glow around them
  const haloMat = flameMat(0xff4a18, 0.08, true);
  const halo = new THREE.Mesh(shared('halo', () => new THREE.SphereGeometry(0.9 * S, 16, 12)), haloMat);
  halo.position.y = 1.1 * S;
  halo.scale.set(1, 1.5, 1);
  root.add(halo);
  let open = 0.3;
  const local = new THREE.Vector3();
  const place = (out: THREE.Vector3): THREE.Vector3 => {
    const yaw = root.rotation.y;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    local.copy(out).multiplyScalar(S);
    out.set(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
    return out.add(root.position);
  };
  return {
    type: 'warden',
    root,
    radius: body.radius * S,
    height: body.height * S,
    headRadius: body.headRadius * S,
    reset(s: number): void {
      body.reset(s);
    },
    update(state: ZombieAnimState, dt: number): void {
      body.update(state, dt);
      const dead = state.mode === 'death';
      // the wings: a slow beat; spread wide in a roar, swept back in a charge, folding as it dies
      const want = dead ? -0.6 : state.mode === 'roar' ? 1 : state.mode === 'charge' || state.mode === 'run' ? 0.05 : 0.35;
      open += (want - open) * Math.min(1, dt * 4);
      const beat = dead ? 0 : Math.sin(state.time * (state.mode === 'roar' ? 7 : 2.2)) * 0.14;
      wings.forEach((w, i) => {
        const side = i === 0 ? -1 : 1;
        w.rotation.y = side * (0.55 - open * 0.5 + beat);
        w.rotation.z = side * (open - 0.35) * 0.6;
        w.visible = !dead || state.deathT < 1.4;
        w.scale.setScalar(1.55 * (dead ? Math.max(0.01, 1 - state.deathT / 1.4) : 1));
      });
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 5.3) * Math.sin(state.time * 1.7 + 1);
      haloMat.opacity = dead ? 0 : 0.035 + 0.045 * pulse;
      crown.visible = !dead;
    },
    getHeadWorld: (out) => place(body.getHeadWorld(out)),
    getChestWorld: (out) => place(body.getChestWorld(out)),
    getHandWorld: (out) => place(body.getHandWorld(out)),
    setVisible(v: boolean): void {
      root.visible = v;
      body.setVisible(true);
    },
    dispose(): void {
      crown.removeFromParent(); // its shapes are shared: not the head's to dispose
      body.clearAttach?.();
      body.dispose();
      root.removeFromParent();
      haloMat.dispose();
    },
  };
}
