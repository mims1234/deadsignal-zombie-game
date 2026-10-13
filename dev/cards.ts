/**
 * Card carrier line-up: every carrier's 3D stand-in under the game's lighting, with its card floating overhead and
 * a loot card beside it, for tuning the looks in `src/cards/cosplay.ts` against the art.
 * Scripted API on `window.__cards`: setMode(name), cam(x,y,z, tx,ty,tz), focus(index, dist, side, y).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCardKits, makeCardBody } from '../src/cards/cardArt';
import { buildCarrierAssets } from '../src/cards/cosplay';
import { CARRIERS } from '../src/cards/roster';
import { RENDER } from '../src/config';
import { createDetailTexture, createZombieMaterial } from '../src/enemies/zombie/material';
import { ZombieRigImpl } from '../src/enemies/zombie/rig';
import type { ZombieAnimState, ZombieMode } from '../src/enemies/zombieRigTypes';
import { createEnvironment, createRenderer, createSkyDome, setupBlueHour } from '../src/render/stage';

type Mode = 'idle' | 'walk' | 'attack' | 'down';
const SPACING = 1.9;

const renderer = createRenderer();
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = createSkyDome();
scene.add(sky);
scene.environment = createEnvironment(renderer);
scene.environmentIntensity = 0.55;
const stage = setupBlueHour(scene, 22);
stage.setShadowQuality(true, 2048);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / Math.max(1, window.innerHeight), RENDER.near, RENDER.far);
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI * 0.495;
controls.enableDamping = true;

function frameAll(): void {
  // the pane can report a zero-sized window while it is hidden
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 1.6;
  camera.position.set(0, 1.6, Math.max(7, 5.4 / (Math.tan(THREE.MathUtils.degToRad(22.5)) * aspect)));
  controls.target.set(0, 1.1, 0);
  controls.update();
}
frameAll();

const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.85, metalness: 0 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const kits = await loadCardKits(CARRIERS);
const material = createZombieMaterial(createDetailTexture());
const head = new THREE.Vector3();
const actors = CARRIERS.map((def, i) => {
  const kit = kits.get(def.id)!;
  const rig = new ZombieRigImpl(buildCarrierAssets(def, i), material, { radius: 0.3, height: def.height, headRadius: 0.18 }, 77 + i);
  rig.root.position.set((i - (CARRIERS.length - 1) / 2) * SPACING, 0, 0);
  // rigs face -Z; turn them toward the camera
  rig.root.rotation.y = Math.PI;
  const portrait = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.front, alphaTest: 0.5 }));
  portrait.center.set(0.5, 0);
  portrait.scale.set(0.72 * kit.aspect, 0.72, 1);
  const loot = makeCardBody(kit, 1.05, 0.9);
  loot.position.set(rig.root.position.x, 0.45, -2.2);
  scene.add(rig.root, portrait, loot);
  const state: ZombieAnimState = { mode: 'idle', speed: 0, time: 0, actionT: 0, staggerT: 0, deathT: 0, aggro: 0.3, hitKick: 0, deathStyle: 0, headshotDeath: false, enraged: false };
  return { def, rig, portrait, loot, state };
});

let mode: Mode = 'idle';
let modeT = 0;
let time = 0;

function setMode(next: Mode): void {
  if (mode === 'down') actors.forEach((a, i) => a.rig.reset(177 + i));
  mode = next;
  modeT = 0;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#modes button')) b.classList.toggle('on', b.dataset.m === next);
}

function update(dt: number): void {
  time += dt;
  modeT += dt;
  const rigMode: ZombieMode = mode === 'down' ? 'death' : mode;
  for (const a of actors) {
    a.state.mode = rigMode;
    a.state.time = time;
    a.state.speed = mode === 'walk' ? 1 : 0;
    a.state.actionT = (modeT % 1.5) / 1.5;
    a.state.deathT = modeT;
    a.rig.update(a.state, dt);
    a.rig.getHeadWorld(head);
    a.portrait.position.set(head.x, head.y + 0.34, head.z);
    a.loot.rotation.y = time * 0.9;
  }
}

const modeBar = document.getElementById('modes')!;
for (const [m, text] of [['idle', 'Idle'], ['walk', 'Walk'], ['attack', 'Attack'], ['down', 'Knock down']] as const) {
  const b = document.createElement('button');
  b.textContent = text;
  b.dataset.m = m;
  b.addEventListener('click', () => setMode(m));
  modeBar.appendChild(b);
}
const reset = document.createElement('button');
reset.textContent = 'Reset view';
reset.addEventListener('click', frameAll);
modeBar.appendChild(reset);
setMode('idle');

window.addEventListener('resize', () => {
  if (window.innerHeight === 0) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const w = window as unknown as { __ready: boolean; __cards: Record<string, unknown> };
w.__cards = {
  setMode,
  cam(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    camera.position.set(x, y, z);
    controls.target.set(tx, ty, tz);
    controls.update();
  },
  /** Put the camera in front of carrier `i` (`side` swings it around, in radians). */
  focus(i: number, dist = 2.4, side = 0, y = 1.15) {
    const x = actors[i]!.rig.root.position.x;
    camera.position.set(x + Math.sin(side) * dist, y + 0.15, Math.cos(side) * dist);
    controls.target.set(x, y, 0);
    controls.update();
  },
};

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  controls.update();
  sky.position.copy(camera.position);
  (sky.userData.uniforms.uTime as THREE.IUniform).value = now / 1000;
  stage.focusShadow(controls.target);
  renderer.render(scene, camera);
  w.__ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
