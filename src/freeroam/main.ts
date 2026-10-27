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
import { Ruin } from './ruin';
import { Director, LOOP } from './scene';
import { buildWorld } from './world';
import { showVersionTag } from '../version';
import { stayFresh } from '../freshness';
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
const ruin = new Ruin(scene, world, fx.time, fx.px, low);
const director = new Director(knight, giant, fx, world, ruin);
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
// the film camera is how it opens; leave it to walk or fly
let film = true;
let slow = false;
let timeScale = 1;

const flashEl = $('fr-flash');
const phaseEl = $('fr-phase-name');
const barEl = $('fr-bar');
const hintEl = $('fr-hint');
const soundBtn = $<HTMLButtonElement>('fr-sound');

/** Where you were and where you looked when the film took over, so leaving it puts you back there. */
let roamPose: { pos: THREE.Vector3; yaw: number; pitch: number; fly: boolean } | null = null;

function setFilm(on: boolean): void {
  if (!film && on) roamPose = { pos: controls.pos.clone(), yaw: controls.yaw, pitch: controls.pitch, fly: controls.fly };
  if (film && !on) {
    if (roamPose) {
      // back to your own spot and view: the film never moves you
      controls.pos.copy(roamPose.pos);
      controls.setLook(roamPose.yaw, roamPose.pitch);
      setFly(roamPose.fly);
    } else {
      // the first time out of the opening film you step in where its camera was, looking where it looked
      const dir = camera.getWorldDirection(new THREE.Vector3());
      controls.pos.copy(camera.position);
      controls.pos.y = Math.max(controls.pos.y, 1.7 + world.ground.heightAt(controls.pos.x, controls.pos.z));
      controls.setLook(Math.atan2(-dir.x, -dir.z), Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)));
      if (controls.pos.y > 4) setFly(true);
    }
  }
  film = on;
  document.body.classList.toggle('film', on);
  $('fr-btn-film').classList.toggle('on', on);
  if (!on) {
    camera.fov = 70;
    camera.updateProjectionMatrix();
  }
  resize();
}
function setLoop(on: boolean): void {
  director.loop = on;
  $('fr-btn-loop').classList.toggle('on', on);
  try {
    localStorage.setItem('ds-freeroam-loop', on ? '1' : '0');
  } catch {
    /* private mode */
  }
}
function setFly(on: boolean): void {
  controls.fly = on;
  $('fr-btn-fly').classList.toggle('on', on);
  document.body.classList.toggle('flying', on);
}
/** F, FLY or a double-tap of Space: from the film that means "fly from here"; roaming, it switches flying. */
function toggleFly(): void {
  if (film) {
    setFilm(false);
    setFly(true);
  } else setFly(!controls.fly);
}
controls.onToggleFly = toggleFly;
// moving or looking means you want to roam: the film camera hands you the view
controls.onInput = () => {
  if (film) setFilm(false);
};
function setSlow(on: boolean): void {
  slow = on;
  $('fr-btn-slow').classList.toggle('on', on);
}
function replay(): void {
  director.restart();
}
const volPanel = $('fr-volume');
const muteBox = $<HTMLInputElement>('fr-vol-mute');
function setMuted(m: boolean): void {
  audio.setMuted(m);
  soundBtn.classList.toggle('off', m);
  muteBox.checked = m;
  try {
    localStorage.setItem('ds-freeroam-muted', m ? '1' : '0');
  } catch {
    /* private mode */
  }
}
try {
  if (localStorage.getItem('ds-freeroam-muted') === '1') setMuted(true);
  setLoop(localStorage.getItem('ds-freeroam-loop') !== '0');
} catch {
  setLoop(true);
}
document.body.classList.add('film');
$('fr-btn-film').classList.add('on');

director.onCue = (c, at) => audio.cue(c, at, camera.position);

// sound starts with the first gesture
const unlock = (): void => audio.unlock();
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
addEventListener('touchstart', unlock, { passive: true });

// full screen (not on iPhones, which only allow it for video): on a phone it also turns to landscape where it can
const fullBtn = $('fr-btn-full');
const canFull = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';
if (!canFull) fullBtn.hidden = true;
function toggleFull(): void {
  if (!canFull) return;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else
    void document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (touch && o.lock) return o.lock('landscape').catch(() => {});
      })
      .catch(() => {});
}
document.addEventListener('fullscreenchange', () => fullBtn.classList.toggle('on', !!document.fullscreenElement));

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyG') toggleFull();
  else if (e.code === 'KeyC') setFilm(!film);
  else if (e.code === 'KeyF') toggleFly();
  else if (e.code === 'KeyT') setSlow(!slow);
  else if (e.code === 'KeyR') replay();
  else if (e.code === 'KeyL') setLoop(!director.loop);
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
hold('fr-btn-fly', toggleFly);
hold('fr-btn-film', () => setFilm(!film));
hold('fr-btn-slow', () => setSlow(!slow));
hold('fr-btn-replay', replay);
// (a click, not a press: browsers only allow full screen from a completed tap)
fullBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
fullBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFull();
});
hold('fr-btn-loop', () => setLoop(!director.loop));
// the speaker opens the volume panel; levels are remembered
type Level = keyof typeof audio.volume;
function saveLevels(): void {
  try {
    localStorage.setItem('ds-freeroam-volume', JSON.stringify(audio.volume));
  } catch {
    /* private mode */
  }
}
try {
  const saved = JSON.parse(localStorage.getItem('ds-freeroam-volume') ?? '{}') as Partial<Record<Level, number>>;
  for (const k of Object.keys(audio.volume) as Level[]) if (typeof saved[k] === 'number') audio.setVolume(k, saved[k]);
} catch {
  /* nothing saved */
}
for (const input of Array.from(volPanel.querySelectorAll<HTMLInputElement>('input[data-vol]'))) {
  const k = input.dataset.vol as Level;
  input.value = String(Math.round(audio.volume[k] * 100));
  input.addEventListener('input', () => {
    audio.setVolume(k, Number(input.value) / 100);
    saveLevels();
  });
}
muteBox.addEventListener('change', () => setMuted(muteBox.checked));
function showVolume(open: boolean): void {
  volPanel.hidden = !open;
  soundBtn.setAttribute('aria-expanded', String(open));
}
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  unlock();
  showVolume(volPanel.hidden !== false);
});
// keep clicks and drags on the panel from steering the camera; close it when you go back to the scene
for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click'] as const) volPanel.addEventListener(ev, (e) => e.stopPropagation());
canvas.addEventListener('pointerdown', () => showVolume(false));

hintEl.textContent = touch
  ? 'Left thumb: move · drag right side: look'
  : 'C leaves the film camera to walk · drag or click to look · WASD move · Shift run · Space jump · F (or Space twice) to fly · T slow motion · L loop on/off · R replay · M mute (the speaker sets volumes) · G full screen';
setTimeout(() => hintEl.classList.add('gone'), 12000);

// ---- the loop ----
const clock = new THREE.Clock();
let elapsed = 0;
let slowFrames = 0;
let fastFrames = 0;
let heldOnce = false;
const shakeV = new THREE.Vector3();

function frame(): void {
  // a slow frame still moves the scene on in real time (up to a tenth of a second), so the score stays in step
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.1);
  const targetScale = slow ? 0.3 : 1;
  timeScale += (targetScale - timeScale) * Math.min(1, dt * 6);
  if (Math.abs(targetScale - timeScale) < 0.005) timeScale = targetScale;
  let sdt = dt * timeScale;
  // with the score playing, the scene runs on the score's clock: slow frames catch up instead of drifting
  const scoreAt = audio.position();
  if (scoreAt !== null && !director.held) {
    const lead = scoreAt - director.t;
    // (a long hitch, a first-time shader compile, still catches up: the music never jumps back to wait for it)
    if (lead > -0.5 && lead < Math.max(2, raw * timeScale + 0.5)) sdt = Math.max(0, lead);
  }
  elapsed += sdt;

  director.update(sdt, elapsed);
  // not looping: when the scene comes to rest, the world is yours to walk
  if (director.held && film && !heldOnce) {
    heldOnce = true;
    setFilm(false);
  }
  if (!director.held) heldOnce = false;

  if (film) director.film(camera);
  else {
    controls.update(dt, world.colliders, world.ground.heightAt);
    controls.apply(camera);
  }
  // the camera shakes with what happens near it
  const d = camera.position.distanceTo(director.shakeAt);
  // (walking, you get a gentler shake: it's your camera)
  const amp = director.shake * (film ? 0.22 : 0.1) * (1 / (1 + d / 30));
  if (amp > 0.001) camera.position.add(shakeV.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp));
  world.sky.position.copy(camera.position);

  flashEl.style.opacity = director.flash.toFixed(3);
  flashEl.classList.toggle('white', director.flashWhite);
  flashEl.classList.toggle('black', director.flashBlack);
  // after the blast the whole world is blown out, and comes back slowly
  renderer.toneMappingExposure = 1.05 * director.exposure;
  bloom.strength = 0.6 + (director.exposure - 1) * 0.12;
  phaseEl.textContent = director.phase();
  barEl.style.transform = `scaleX(${(director.t / LOOP).toFixed(4)})`;

  audio.update(director.t, timeScale, camera.position, director.held);

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
stayFresh();

// for the browser checks
Object.assign(window, { __freeroam: { director, controls, renderer, audio, scene, world, ruin, setFilm, setFly, get ratio() { return ratio; }, get bloom() { return useBloom; } } });
