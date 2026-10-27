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
import { reportVisit } from '../net/account';
import { readGpuVendor } from '../render/device';
import './freeroam.css';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
// the stylesheet is in (imported above): show the page (freeroam.html keeps it hidden until now)
document.body.classList.add('styled');

const touch = matchMedia('(pointer: coarse)').matches;
const low = touch || (navigator.hardwareConcurrency ?? 8) <= 4;
document.body.classList.toggle('touch', touch);

// ---- renderer ----
const canvas = $<HTMLCanvasElement>('fr-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
/**
 * Graphics: AUTO starts at what suits the device and steps the resolution (then the glow) down when frames run long and
 * back up when there is room; LOW / MEDIUM / HIGH hold a fixed level. Remembered on this browser.
 */
type Gfx = 'auto' | 'low' | 'medium' | 'high';
let gfx: Gfx = 'auto';
try {
  const g = localStorage.getItem('ds-freeroam-gfx');
  if (g === 'low' || g === 'medium' || g === 'high') gfx = g;
} catch {
  /* private mode */
}
/** The sharpest AUTO goes, and where it starts. */
const autoTop = (): number => Math.min(devicePixelRatio, low ? 1 : 1.5);
const GFX_RATIO: Record<Exclude<Gfx, 'auto'>, () => number> = {
  low: () => Math.min(devicePixelRatio, 0.7),
  medium: () => Math.min(devicePixelRatio, 1),
  high: () => Math.min(devicePixelRatio, 1.5),
};
/**
 * Drawn without the graphics card (hardware acceleration switched off: the browser falls back to drawing on the
 * processor), on a computer: say so on the loading screen, and let AUTO start at its lowest.
 */
const software = !touch && readGpuVendor(renderer.getContext()) === 'Software';
if (software) $('fr-gpu').hidden = false;
const autoStart = (): number => (software ? 0.6 : Math.min(devicePixelRatio, low ? 1 : 1.25));
let ratio = gfx === 'auto' ? autoStart() : GFX_RATIO[gfx]();
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

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: gfx === 'high' || (gfx === 'auto' && !low) ? 4 : 0 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = gfx !== 'low';

function setGfx(g: Gfx): void {
  gfx = g;
  ratio = g === 'auto' ? autoStart() : GFX_RATIO[g]();
  useBloom = g !== 'low';
  // smoothing the edges is the costliest part: only on HIGH, and on AUTO for a computer
  const samples = g === 'high' || (g === 'auto' && !low) ? 4 : 0;
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
    if (rt.samples !== samples) {
      rt.samples = samples;
      rt.dispose();
    }
  }
  slowFrames = fastFrames = 0;
  resize();
  for (const b of Array.from(document.querySelectorAll<HTMLElement>('[data-gfx]'))) {
    const on = b.dataset.gfx === g;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  try {
    localStorage.setItem('ds-freeroam-gfx', g);
  } catch {
    /* private mode */
  }
}

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
// (the hint shows once the film starts: see play())

// ---- the loop ----
const clock = new THREE.Clock();
let elapsed = 0;
let slowFrames = 0;
let fastFrames = 0;
let heldOnce = false;
const shakeV = new THREE.Vector3();

const creditEl = $('fr-credit');
document.body.classList.add('prestart');
let heldFor = 0;

/** Until PLAY: the scene posed where the film's first shot settles, the camera circling her (nothing else runs or plays). */
let started = false;
const STILL_AT = 2.2;
let orbit = 0.5;

function frame(): void {
  if (!started) {
    // the camera circles her slowly, low and close, looking up a little
    orbit += Math.min(clock.getDelta(), 0.1) * 0.16;
    // (on a wide screen she stands right of centre, clear of the title on the left)
    const at = knight.root.position;
    const side = camera.aspect > 1.2 ? 1.1 : 0.2;
    camera.position.set(at.x + Math.sin(orbit) * 4.4, 1.55 + Math.sin(orbit * 0.7) * 0.2, at.z + Math.cos(orbit) * 4.4);
    camera.lookAt(at.x - Math.cos(orbit) * side, at.y + 1.25, at.z + Math.sin(orbit) * side);
    world.sky.position.copy(camera.position);
    if (useBloom) composer.render(0);
    else renderer.render(scene, camera);
    return;
  }
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
  // the credit: from the ruins' first quiet until the fade to black (left at rest, for a while, then it goes)
  if (director.held) heldFor += dt;
  else heldFor = 0;
  creditEl.classList.toggle('on', director.t >= 76 && director.t < 86.4 && heldFor < 10);
  barEl.style.transform = `scaleX(${(director.t / LOOP).toFixed(4)})`;

  audio.update(director.t, timeScale, camera.position, director.held);

  if (useBloom) composer.render(dt);
  else renderer.render(scene, camera);

  // keep the frame rate: step the resolution down when frames run long, back up when there is room
  if (gfx !== 'auto') return;
  if (dt > 1 / 40) (slowFrames++, (fastFrames = 0));
  else if (dt < 1 / 70) (fastFrames++, (slowFrames = 0));
  if (slowFrames > 45) {
    slowFrames = 0;
    if (ratio > minRatio) {
      ratio = Math.max(minRatio, ratio - 0.15);
      resize();
    } else if (useBloom) useBloom = false;
  } else if (fastFrames > 240 && (ratio < autoTop() || !useBloom)) {
    fastFrames = 0;
    if (!useBloom) useBloom = true;
    else ratio = Math.min(autoTop(), ratio + 0.1);
    resize();
  }
}

for (const b of Array.from(document.querySelectorAll<HTMLElement>('[data-gfx]'))) b.addEventListener('click', () => setGfx(b.dataset.gfx as Gfx));
setGfx(gfx);

/**
 * Prepare every effect before the film starts. The browser only builds an effect's shaders the first time it is drawn,
 * and hidden ones (the sparks, auras, debris, the beam) are skipped, so without this the fight hitches each time one
 * first appears. Everything is shown for the compile (nothing is drawn), then put back.
 */
async function warmUp(): Promise<void> {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* it will compile as it goes instead */
  }
  for (const o of hidden) o.visible = false;
}
// ---- loading: everything in before PLAY ----
const startEl = $('fr-start');
const loadEl = $('fr-load');
const fillEl = $('fr-load-fill');
const statusEl = $('fr-load-txt');
const playBtn = $<HTMLButtonElement>('fr-play');
let soundShare = 0;
let effectsReady = false;
const showProgress = (): void => {
  fillEl.style.transform = `scaleX(${(0.04 + soundShare * 0.76 + (effectsReady ? 0.2 : 0)).toFixed(3)})`;
};
showProgress();
statusEl.textContent = 'GATHERING THE DARK';
// the still: the scene posed where the first shot settles, drawn once the effects are prepared
director.t = STILL_AT;
director.update(0, 0);
const effects = warmUp().then(() => {
  effectsReady = true;
  showProgress();
  renderer.setAnimationLoop(frame);
});
const sound = audio.preload((done, total) => {
  soundShare = done / total;
  if (effectsReady) statusEl.textContent = `TUNING THE SCORE  ${done} / ${total}`;
  showProgress();
});
void Promise.all([effects, sound]).then(() => {
  statusEl.textContent = 'THE BLADE IS READY';
  // the loading screen lifts off the start screen, the camera already circling her
  setTimeout(() => {
    loadEl.classList.add('gone');
    playBtn.disabled = false;
    playBtn.focus({ preventScroll: true });
  }, 250);
  setTimeout(() => (loadEl.hidden = true), 1100);
});

function play(): void {
  if (started || playBtn.disabled) return;
  started = true;
  document.body.classList.remove('prestart');
  audio.unlock();
  director.restart();
  clock.getDelta();
  startEl.classList.add('gone');
  setTimeout(() => (startEl.hidden = true), 700);
  setTimeout(() => hintEl.classList.add('gone'), 12000);
}
playBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  play();
});
for (const ev of ['pointerdown', 'mousedown', 'touchstart'] as const) startEl.addEventListener(ev, (e) => e.stopPropagation());
// (a tap on the start screen closes the sound panel, as a tap on the scene does)
startEl.addEventListener('pointerdown', () => showVolume(false));
addEventListener('keydown', (e) => {
  if (!started && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    play();
  }
});
showVersionTag();
stayFresh();
reportVisit(matchMedia('(pointer: coarse)').matches, 'excalibur');

// for the browser checks
Object.assign(window, { __freeroam: { director, controls, renderer, audio, scene, world, ruin, setFilm, setFly, get ratio() { return ratio; }, get bloom() { return useBloom; } } });
