/**
 * Excalibur (`/freeroam.html`): a free-roam film set, apart from the game. A black-armoured knight and a giant play
 * out one scene on a loop - the shadow rising, the clash, the charge, the blade brought down - and you walk or fly
 * anywhere through it, or watch it as the film would cut it.
 *
 * Built for speed: a few dozen draw calls, effects animated in shaders, bloom only on what glows, and a resolution
 * that steps down by itself when frames run long.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Giant, Knight } from './actors';
import { SceneAudio } from './audio';
import { Controls } from './controls';
import { Fx } from './fx';
import { Director, LOOP } from './scene';
import { buildWorld } from './world';
import { showVersionTag } from '../version';
import './freeroam.css';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const touch = matchMedia('(pointer: coarse)').matches;
const low = touch || (navigator.hardwareConcurrency ?? 8) <= 4;
document.body.classList.toggle('touch', touch);

// ---- renderer ----
const canvas = $<HTMLCanvasElement>('fr-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
let ratio = Math.min(devicePixelRatio, low ? 1 : 1.5);
const minRatio = 0.55;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 700);

const world = buildWorld(scene, low);
const knight = new Knight();
const giant = new Giant();
scene.add(knight.root, giant.root);
const fx = new Fx(scene, { low });
const director = new Director(knight, giant, fx, world);
const controls = new Controls(canvas, { base: $('fr-stick'), knob: $('fr-knob') });
const audio = new SceneAudio();

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: low ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = true;

function resize(): void {
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fx.px.value = (innerHeight * ratio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
addEventListener('resize', resize);
resize();

// ---- state the player changes ----
let film = false;
let slow = false;
let timeScale = 1;

const flashEl = $('fr-flash');
const phaseEl = $('fr-phase-name');
const barEl = $('fr-bar');
const hintEl = $('fr-hint');
const soundBtn = $<HTMLButtonElement>('fr-sound');

function setFilm(on: boolean): void {
  film = on;
  document.body.classList.toggle('film', on);
  $('fr-btn-film').classList.toggle('on', on);
  if (!on) {
    camera.fov = 70;
    camera.updateProjectionMatrix();
  }
  resize();
}
function setFly(on: boolean): void {
  controls.fly = on;
  $('fr-btn-fly').classList.toggle('on', on);
  document.body.classList.toggle('flying', on);
}
controls.onToggleFly = () => setFly(!controls.fly);
function setSlow(on: boolean): void {
  slow = on;
  $('fr-btn-slow').classList.toggle('on', on);
}
function replay(): void {
  director.restart();
}
function setMuted(m: boolean): void {
  audio.setMuted(m);
  soundBtn.classList.toggle('off', m);
  soundBtn.setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
  try {
    localStorage.setItem('ds-freeroam-muted', m ? '1' : '0');
  } catch {
    /* private mode */
  }
}
try {
  if (localStorage.getItem('ds-freeroam-muted') === '1') setMuted(true);
} catch {
  /* private mode */
}

director.onCue = (c, at) => audio.cue(c, at, camera.position);

// sound starts with the first gesture (and that gesture doesn't also count as a press of the sound button)
let unlockedAt = -1;
const unlock = (): void => {
  if (unlockedAt < 0) unlockedAt = performance.now();
  audio.unlock();
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
addEventListener('touchstart', unlock, { passive: true });

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyC') setFilm(!film);
  else if (e.code === 'KeyF') setFly(!controls.fly);
  else if (e.code === 'KeyT') setSlow(!slow);
  else if (e.code === 'KeyR') replay();
  else if (e.code === 'KeyM') setMuted(!audio.muted);
});

const hold = (id: string, down: () => void, up?: () => void): void => {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    down();
  });
  if (up) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => up());
};
hold('fr-btn-jump', () => (controls.up = true), () => (controls.up = false));
hold('fr-btn-fly', () => setFly(!controls.fly));
hold('fr-btn-film', () => setFilm(!film));
hold('fr-btn-slow', () => setSlow(!slow));
hold('fr-btn-replay', replay);
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const first = unlockedAt < 0 || performance.now() - unlockedAt < 600;
  unlock();
  if (!first) setMuted(!audio.muted);
});

hintEl.textContent = touch
  ? 'Left thumb: move · drag right side: look'
  : 'Drag or click to look · WASD move · Shift run · Space jump · F (or Space twice) to fly · C film camera · T slow motion · R replay · M sound';
setTimeout(() => hintEl.classList.add('gone'), 12000);

// ---- the loop ----
const clock = new THREE.Clock();
let elapsed = 0;
let slowFrames = 0;
let fastFrames = 0;
const shakeV = new THREE.Vector3();

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  timeScale += ((slow ? 0.3 : 1) - timeScale) * Math.min(1, dt * 6);
  const sdt = dt * timeScale;
  elapsed += sdt;

  director.update(sdt, elapsed);

  if (film) director.film(camera);
  else {
    controls.update(dt, world.colliders);
    controls.apply(camera);
  }
  // the camera shakes with what happens near it
  const d = camera.position.distanceTo(director.shakeAt);
  const amp = director.shake * 0.22 * (1 / (1 + d / 30));
  if (amp > 0.001) camera.position.add(shakeV.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp));
  world.sky.position.copy(camera.position);

  flashEl.style.opacity = director.flash.toFixed(3);
  flashEl.classList.toggle('black', director.flashBlack);
  phaseEl.textContent = director.phase();
  barEl.style.transform = `scaleX(${(director.t / LOOP).toFixed(4)})`;

  audio.update(director.t, timeScale, camera.position);

  if (useBloom) composer.render(dt);
  else renderer.render(scene, camera);

  // keep the frame rate: step the resolution down when frames run long, back up when there is room
  if (dt > 1 / 40) (slowFrames++, (fastFrames = 0));
  else if (dt < 1 / 70) (fastFrames++, (slowFrames = 0));
  if (slowFrames > 45) {
    slowFrames = 0;
    if (ratio > minRatio) {
      ratio = Math.max(minRatio, ratio - 0.15);
      resize();
    } else if (useBloom) useBloom = false;
  } else if (fastFrames > 240 && ratio < Math.min(devicePixelRatio, low ? 1 : 1.5)) {
    fastFrames = 0;
    ratio = Math.min(Math.min(devicePixelRatio, low ? 1 : 1.5), ratio + 0.1);
    resize();
  }
}
renderer.setAnimationLoop(frame);
showVersionTag();

// for the browser checks
Object.assign(window, { __freeroam: { director, controls, renderer, audio, scene, world, setFilm, setFly, get ratio() { return ratio; }, get bloom() { return useBloom; } } });
