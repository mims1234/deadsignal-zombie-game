/**
 * HIRASAKA's paid mystery box drawn as what it is there (arms wave): a shrine's travelling offering box. A dark wooden
 * saisen-bako on short legs, its top a slope of slats, a straw rope round it with paper zigzags hanging, and a small
 * paper lantern on its lid. Opened, the slatted lid swings back and the inside glows warm; the prize rises out of it
 * (the reel, `CrateRuntime`). `game/entities.ts` uses it in place of the loot crate on HIRASAKA's paid box only.
 *
 * Origin at the floor under its middle; about 0.95 m tall, 1.1 m wide. Four draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CrateModel } from '../models';

const W = 1.1;
const D = 0.62;
const H = 0.7;

function at(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  g.rotateX(rx).rotateY(ry).rotateZ(rz);
  return g.translate(x, y, z);
}

export function createOfferingBox(): CrateModel {
  const root = new THREE.Group();
  root.name = 'OfferingBox';
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.75 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xd2bc80, roughness: 0.95 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x402010, emissive: 0xffa040, emissiveIntensity: 1.2, roughness: 0.6 });
  // the body: four walls, a floor, short legs, a brass-capped rim
  const body = mergeGeometries([
    at(new THREE.BoxGeometry(W, H, 0.05), 0, H / 2 + 0.08, D / 2 - 0.025),
    at(new THREE.BoxGeometry(W, H * 0.8, 0.05), 0, H * 0.4 + 0.08, -D / 2 + 0.025),
    at(new THREE.BoxGeometry(0.05, H, D), W / 2 - 0.025, H / 2 + 0.08, 0),
    at(new THREE.BoxGeometry(0.05, H, D), -W / 2 + 0.025, H / 2 + 0.08, 0),
    at(new THREE.BoxGeometry(W, 0.05, D), 0, 0.1, 0),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => at(new THREE.BoxGeometry(0.08, 0.08, 0.08), sx * (W / 2 - 0.06), 0.04, sz * (D / 2 - 0.06)))),
    at(new THREE.BoxGeometry(W + 0.06, 0.04, 0.06), 0, H + 0.08, D / 2),
    at(new THREE.BoxGeometry(W + 0.06, 0.04, 0.06), 0, H * 0.8 + 0.08, -D / 2),
  ])!;
  const bodyMesh = new THREE.Mesh(body, wood);
  // the rope round its waist and the paper zigzags hanging off the front
  const ropeGeo = mergeGeometries([
    at(new THREE.BoxGeometry(W + 0.04, 0.05, 0.05), 0, H * 0.62, D / 2 + 0.02),
    at(new THREE.BoxGeometry(0.05, 0.05, D + 0.04), W / 2 + 0.02, H * 0.62, 0),
    at(new THREE.BoxGeometry(0.05, 0.05, D + 0.04), -W / 2 - 0.02, H * 0.62, 0),
    ...[-0.32, 0, 0.32].flatMap((x) => [at(new THREE.BoxGeometry(0.06, 0.07, 0.004), x, H * 0.62 - 0.07, D / 2 + 0.05, 0, 0, 0.25), at(new THREE.BoxGeometry(0.06, 0.07, 0.004), x + 0.02, H * 0.62 - 0.14, D / 2 + 0.05, 0, 0, -0.25)]),
  ])!;
  const ropeMesh = new THREE.Mesh(ropeGeo, straw);
  // the lid: slats sloping down to the front, on a hinge at the back (it opens back)
  const lid = new THREE.Group();
  lid.position.set(0, H * 0.8 + 0.1, -D / 2);
  const slats = mergeGeometries(Array.from({ length: 7 }, (_, i) => at(new THREE.BoxGeometry(0.1, 0.035, D + 0.08), -W / 2 + 0.1 + i * ((W - 0.2) / 6), 0.0, D / 2, -0.32, 0, 0)))!;
  lid.add(new THREE.Mesh(slats, wood));
  // the little paper lantern standing on the lid, and the warm glow inside (seen when it opens)
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.18, 10).translate(0.36, 0.15, D / 2 - 0.1), glow);
  lid.add(lantern);
  const inside = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.02, D - 0.12).translate(0, 0.14, 0), glow);
  root.add(bodyMesh, ropeMesh, lid, inside);
  let open = 0;
  let looted = false;
  return {
    root,
    body: root,
    topLocal: new THREE.Vector3(0, H + 0.45, 0),
    setOpen(t: number): void {
      open = Math.max(0, Math.min(1, t));
      lid.rotation.x = -1.6 * open;
      inside.visible = open > 0.05;
    },
    setLooted(l: boolean): void {
      looted = l;
    },
    update(_dt: number, time: number): void {
      glow.emissiveIntensity = (looted ? 0.4 : 1.1) + 0.25 * Math.sin(time * 5.3) * Math.sin(time * 1.7) + 0.6 * open;
    },
    dispose(): void {
      body.dispose();
      ropeGeo.dispose();
      slats.dispose();
      lantern.geometry.dispose();
      inside.geometry.dispose();
      wood.dispose();
      straw.dispose();
      glow.dispose();
    },
  };
}
