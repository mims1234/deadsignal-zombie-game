/**
 * ZARYA's paid mystery box drawn as what it is there: Ded Moroz's gift sack (`game/entities.ts` uses it in place of the
 * loot crate on ZARYA only). A red cloth sack, lumpy with what is inside, gold snowflakes stitched on its belly, its
 * gathered neck tied with a gold cord in a knot with two tasselled ends. Opened, the cord loosens and slips down onto
 * its shoulders, the knot's ends fall loose, the mouth opens wide and the inside glows warm; the prize rises out of it
 * (the reel, `CrateRuntime`). Shut again, the mouth gathers and the cord draws tight.
 *
 * Origin at the floor under its middle; about 1.25 m tall and a metre across. No lid, no beacon. Six draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CrateModel } from '../models';
import { clamp01, mulberry32, smoothstep } from './util';

/** The neck: where the body ends and the gathered mouth begins (m), and its radius tied. */
const NECK_Y = 1.02;
const NECK_R = 0.13;

let shared: { body: THREE.BufferGeometry; mouth: THREE.BufferGeometry; inside: THREE.BufferGeometry; ring: THREE.BufferGeometry; ends: THREE.BufferGeometry; stitch: THREE.BufferGeometry; cloth: THREE.Material; gold: THREE.Material; dark: THREE.MeshStandardMaterial } | null = null;

/** The body: a lathe from the floor to the neck, pushed out into lumps where the gifts inside press at the cloth. */
function bodyGeo(): THREE.BufferGeometry {
  const prof: [number, number][] = [[0, 0], [0.26, 0.005], [0.42, 0.05], [0.51, 0.17], [0.55, 0.34], [0.54, 0.5], [0.49, 0.66], [0.4, 0.8], [0.27, 0.92], [0.17, 0.99], [NECK_R, NECK_Y]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 30);
  const rnd = mulberry32(1231);
  // a few gifts pressing out: a corner here, a round one there
  const lumps = Array.from({ length: 7 }, () => ({ a: rnd() * Math.PI * 2, y: 0.25 + rnd() * 0.5, s: 0.05 + rnd() * 0.05, w: 0.35 + rnd() * 0.3 }));
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4 || v.y > NECK_Y - 0.02) continue;
    const a = Math.atan2(v.z, v.x);
    let push = 0;
    for (const l of lumps) {
      const da = Math.atan2(Math.sin(a - l.a), Math.cos(a - l.a));
      push += l.s * Math.exp(-((da / l.w) ** 2) - ((v.y - l.y) / 0.16) ** 2);
    }
    // the cloth sags in folds where it is gathered up to the neck
    const fold = v.y > 0.7 ? 0.018 * Math.sin(a * 9) * smoothstep(0.7, 0.98, v.y) : 0;
    const k = (r + push + fold) / r;
    p.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** The gathered mouth above the neck, in pleats (local to the neck, which it opens about). */
function mouthGeo(): THREE.BufferGeometry {
  const prof: [number, number][] = [[NECK_R, 0], [0.145, 0.04], [0.19, 0.1], [0.25, 0.15], [0.29, 0.19], [0.3, 0.215]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 30);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const k = 1 + 0.14 * Math.sin(a * 11) * smoothstep(0.02, 0.2, v.y);
    p.setXYZ(i, v.x * k, v.y + 0.012 * Math.cos(a * 11) * smoothstep(0.1, 0.2, v.y), v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

function getShared(): NonNullable<typeof shared> {
  if (shared) return shared;
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry => g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z).toNonIndexed();
  // the knot at the front of the cord, its two ends hanging, a tassel on each (local to the knot)
  const ends = mergeGeometries([
    at(new THREE.SphereGeometry(0.038, 10, 8), 0, 0, 0),
    at(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), 0.05, -0.12, 0.012, 0, 0, 0.32),
    at(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), -0.04, -0.14, 0.02, 0, 0, -0.22),
    at(new THREE.ConeGeometry(0.03, 0.08, 8), 0.092, -0.25, 0.012, Math.PI, 0, 0.32),
    at(new THREE.ConeGeometry(0.03, 0.08, 8), -0.073, -0.29, 0.02, Math.PI, 0, -0.22),
  ])!;
  // gold snowflakes stitched round the belly: six arms each, laid on the cloth
  const flakes: THREE.BufferGeometry[] = [];
  for (const [a, y, s] of [[0.3, 0.42, 0.13], [2.4, 0.5, 0.11], [4.3, 0.36, 0.12], [5.6, 0.62, 0.08]] as const) {
    const r = 0.555 - Math.abs(y - 0.4) * 0.12;
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.BoxGeometry(0.012, s * 2, 0.006).rotateZ((k * Math.PI) / 3);
      arm.translate(0, 0, r).rotateY(-a + Math.PI / 2).translate(0, y, 0);
      flakes.push(arm.toNonIndexed());
    }
  }
  const dark = new THREE.MeshStandardMaterial({ color: 0x140403, roughness: 1, emissive: 0xff8a2a, emissiveIntensity: 0 });
  shared = {
    body: bodyGeo(),
    mouth: mouthGeo(),
    inside: new THREE.CircleGeometry(NECK_R + 0.012, 24).rotateX(-Math.PI / 2).translate(0, -0.035, 0),
    ring: new THREE.TorusGeometry(NECK_R + 0.018, 0.022, 8, 28).rotateX(Math.PI / 2),
    ends,
    stitch: mergeGeometries(flakes)!,
    cloth: new THREE.MeshStandardMaterial({ color: 0xa61c16, roughness: 0.86, metalness: 0, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe6bd52, roughness: 0.34, metalness: 0.75, emissive: 0x6a4410, emissiveIntensity: 0.35 }),
    dark,
  };
  return shared;
}

/** Ded Moroz's sack, as a mystery box's model (`CrateModel`): `setOpen` opens it, eased in `update`. */
export function createGiftSack(): CrateModel {
  const s = getShared();
  const root = new THREE.Group();
  root.name = 'GiftSack';
  const tilt = new THREE.Group(); // (it settles a little as it opens)
  root.add(tilt);
  const body = new THREE.Mesh(s.body, s.cloth);
  body.castShadow = true;
  body.receiveShadow = true;
  const stitch = new THREE.Mesh(s.stitch, s.gold);
  const neck = new THREE.Group();
  neck.position.y = NECK_Y;
  const mouth = new THREE.Mesh(s.mouth, s.cloth);
  mouth.castShadow = true;
  // the inside, seen once the mouth is open: dark, with something warm glinting down in it
  const dark = s.dark.clone();
  const inside = new THREE.Mesh(s.inside, dark);
  inside.visible = false;
  neck.add(mouth, inside);
  const cord = new THREE.Group();
  cord.position.y = NECK_Y + 0.012;
  const ring = new THREE.Mesh(s.ring, s.gold);
  const ends = new THREE.Mesh(s.ends, s.gold);
  ends.position.set(0, 0, NECK_R + 0.03);
  cord.add(ring, ends);
  tilt.add(body, stitch, neck, cord);

  let target = 0;
  let open = 0;
  let last = -1e9;
  const pose = (k: number, time: number): void => {
    // the cord loosens first and slips down onto the shoulders; its ends fall loose
    const loose = smoothstep(0, 0.45, k);
    ring.scale.setScalar(1 + 0.75 * loose);
    cord.position.y = NECK_Y + 0.012 - 0.1 * loose;
    ends.position.set(0, -0.02 * loose, (NECK_R + 0.03) * (1 + 0.75 * loose));
    ends.rotation.set(0.9 * loose, 0, 0.25 * loose * Math.sin(time * 1.3));
    // then the mouth opens wide and the inside shows, lit warm
    const wide = smoothstep(0.2, 1, k);
    neck.scale.set(1 + 0.95 * wide, 1 + 0.08 * wide, 1 + 0.95 * wide);
    inside.visible = wide > 0.04;
    dark.emissiveIntensity = 0.32 * wide * (0.8 + 0.2 * Math.sin(time * 3.1));
    // it slumps a touch as the neck lets go
    tilt.scale.set(1 + 0.03 * wide, 1 - 0.04 * wide, 1 + 0.03 * wide);
  };
  pose(0, 0);

  return {
    root,
    topLocal: new THREE.Vector3(0, 1.75, 0),
    setOpen(t: number) {
      target = clamp01(t);
    },
    setLooted() {},
    update(dt: number, time: number) {
      // opening follows its caller quickly; shutting again, the mouth gathers and the cord draws tight over a moment.
      // (Not looked after for a while, too far off to be seen: it is simply as it should be, so a sack that moved
      // somewhere is found shut, not seen shutting.)
      const rate = target > open ? 1.6 : 1.25;
      if (time - last > 0.5) open = target;
      last = time;
      open = target > open ? Math.min(target, open + dt * rate) : Math.max(target, open - dt * rate);
      pose(open, time);
    },
    dispose() {
      dark.dispose();
    },
  };
}
