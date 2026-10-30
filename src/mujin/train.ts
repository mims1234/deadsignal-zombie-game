/**
 * MUJIN's trains, in place of the helicopter: the dawn train (the extraction: four cars that pull in on track 1 and
 * open their doors on platform 1) and the through express that rushes past on track 2 just before it. Built here, not
 * in the map's static batches, because they move. The dawn train has the helicopter's shape for the mission
 * (`root`, `doorLocal`, `update`): its door is the middle of the second car, on the platform side (-Z).
 */
import * as THREE from 'three';
import type { HelicopterRig, HelicopterState } from '../world/models';

const CAR = 18;
const GAP = 0.8;

function car(o: { stripe: number; lit: boolean; doors: THREE.Object3D[] }): THREE.Group {
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xc4cad0, roughness: 0.35, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR, 3.1, 2.9), silver);
  body.position.y = 2.55;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(CAR + 0.02, 0.24, 2.92), new THREE.MeshStandardMaterial({ color: o.stripe, roughness: 0.5 }));
  stripe.position.y = 1.9;
  g.add(stripe);
  const glass = new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.1, metalness: 0.3, emissive: o.lit ? 0xfff0d0 : 0x000000, emissiveIntensity: o.lit ? 0.9 : 0 });
  for (let i = 0; i < 5; i++) {
    for (const z of [-1.46, 1.46]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.04), glass);
      w.position.set(-CAR / 2 + 1.8 + i * 3.6, 2.9, z);
      g.add(w);
    }
  }
  // the doors on the platform side: two leaves each, sliding apart
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.45, metalness: 0.5 });
  for (const x of [-CAR / 4, CAR / 4]) {
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.66, 2.0, 0.05), doorMat);
      leaf.position.set(x + s * 0.33, 2.05, -1.48);
      leaf.userData.cx = x + s * 0.33;
      leaf.userData.s = s;
      g.add(leaf);
      o.doors.push(leaf);
    }
  }
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(CAR - 2, 1, 2.6), new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.9 }));
  skirt.position.y = 0.5;
  g.add(skirt);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(CAR, 0.25, 2.7), new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: 0.6 }));
  roof.position.y = 4.2;
  g.add(roof);
  return g;
}

/** The dawn train: four lit cars; `update` opens its doors. */
export function createDawnTrain(): HelicopterRig {
  const root = new THREE.Group();
  root.name = 'DawnTrain';
  const doors: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const c = car({ stripe: 0x2a6ad8, lit: true, doors: i === 1 ? doors : [] });
    c.position.x = (i - 1) * (CAR + GAP);
    root.add(c);
  }
  // its headlight, on the east end (it comes in eastward)
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), new THREE.MeshBasicMaterial({ color: 0xfff8e0 }));
  head.position.set(2 * (CAR + GAP) + CAR / 2 + 0.02, 1.8, 0);
  head.rotation.y = Math.PI / 2;
  root.add(head);
  const light = new THREE.PointLight(0xfff0d0, 30, 40, 2);
  light.position.set(2 * (CAR + GAP) + CAR / 2 + 2, 2, 0);
  root.add(light);
  return {
    root,
    doorLocal: new THREE.Vector3(-CAR / 4, 0, -1.6),
    spotLocal: new THREE.Vector3(0, 2, 0),
    update(_dt: number, s: HelicopterState) {
      const open = Math.max(0, Math.min(1, s.doorOpen));
      for (const d of doors) d.position.x = d.userData.cx + d.userData.s * open * 0.62;
      light.intensity = s.lights ? 30 : 0;
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      root.removeFromParent();
    },
  };
}

/** The through express: six dark cars, every window full of faces; it never stops. */
export function createExpress(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Express';
  for (let i = 0; i < 6; i++) {
    const c = car({ stripe: 0xc0182a, lit: true, doors: [] });
    c.position.x = (i - 3) * (CAR + GAP);
    root.add(c);
  }
  root.visible = false;
  return root;
}

export const TRAIN_LENGTH = { dawn: 4 * (CAR + GAP), express: 6 * (CAR + GAP) };
