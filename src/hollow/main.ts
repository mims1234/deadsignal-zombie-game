/**
 * SLIME HOLLOW (`/hollow.html`): a cinematic set apart from the game, built the way Excalibur is. A burned village,
 * an army at its gate, and the night the Hollow Slime takes Kael; watch it as the film cuts it, or walk and fly
 * through it while it plays.
 *
 * Built for speed: the crowds are instanced (a few hundred people for about two dozen draw calls), effects are
 * animated in shaders, bloom only touches what glows, the film's colour is one pass, and the resolution steps down
 * by itself when frames run long.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Controls } from '../freeroam/controls';
import { makeCast } from './cast';
import { Crowd } from './crowd';
import { Fx } from './fx';
import { Grade } from './grade';
import { SceneAudio } from './audio';
import { Director, LOOP, planCrowds } from './scene';
import { buildWorld } from './world';
import { showVersionTag } from '../version';
import { stayFresh } from '../freshness';
import { loadAccount, reportVisit } from '../net/account';
import { filmAccess } from '../films';
import { readGpuVendor } from '../render/device';
import '../freeroam/freeroam.css';
import './hollow.css';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
// the stylesheets are in (imported above): show the page (hollow.html keeps it hidden until now)
document.body.classList.add('styled');

const touch = matchMedia('(pointer: coarse)').matches;
const low = touch || (navigator.hardwareConcurrency ?? 8) <= 4;
document.body.classList.toggle('touch', touch);

// ---- renderer ----
const canvas = $<HTMLCanvasElement>('fr-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
/** Graphics: AUTO suits the device and steps the resolution (then the glow) down when frames run long; LOW / MEDIUM / HIGH hold a level. */
type Gfx = 'auto' | 'low' | 'medium' | 'high';
let gfx: Gfx = 'auto';
try {
  const g = localStorage.getItem('ds-hollow-gfx');
  if (g === 'low' || g === 'medium' || g === 'high') gfx = g;
} catch {
  /* private mode */
}
const autoTop = (): number => Math.min(devicePixelRatio, low ? 1 : 1.5);
const GFX_RATIO: Record<Exclude<Gfx, 'auto'>, () => number> = {
  low: () => Math.min(devicePixelRatio, 0.7),
  medium: () => Math.min(devicePixelRatio, 1),
  high: () => Math.min(devicePixelRatio, 1.5),
};
const software = !touch && readGpuVendor(renderer.getContext()) === 'Software';
if (software) $('fr-gpu').hidden = false;
const autoStart = (): number => (software ? 0.6 : Math.min(devicePixelRatio, low ? 1 : 1.25));
let ratio = gfx === 'auto' ? autoStart() : GFX_RATIO[gfx]();
const minRatio = 0.55;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 700);

// how many people the crowds hold is set once, at load, by the graphics level
const crowdLevel = gfx === 'low' || (gfx === 'auto' && (software || low)) ? 'low' : gfx === 'medium' ? 'medium' : 'high';
const world = buildWorld(scene, low);
const cast = makeCast();
for (const f of Object.values(cast)) scene.add(f.root);
const fx = new Fx(scene, low);
const plan = planCrowds(crowdLevel);
const choir = new Crowd(scene, plan.choir, 'choir', fx.time, fx.px);
const village = new Crowd(scene, plan.village, 'village', fx.time, fx.px);
const grade = new Grade();
const director = new Director(cast, choir, village, fx, world, grade);
const controls = new Controls(canvas, { base: $('fr-stick'), knob: $('fr-knob') });
// you step in at the village gate, looking out over the field
controls.pos.set(-6, 1.7, 3);
controls.setLook(-0.5, -0.05);
const audio = new SceneAudio();

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: gfx === 'high' || (gfx === 'auto' && !low) ? 4 : 0 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(grade.pass);
composer.addPass(new OutputPass());
let useBloom = gfx !== 'low';
bloom.enabled = useBloom;

function setGfx(g: Gfx): void {
  gfx = g;
  ratio = g === 'auto' ? autoStart() : GFX_RATIO[g]();
  useBloom = g !== 'low';
  bloom.enabled = useBloom;
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
    localStorage.setItem('ds-hollow-gfx', g);
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
  grade.u.uRes.value.set(innerWidth * ratio, innerHeight * ratio);
}
addEventListener('resize', resize);
resize();

// ---- state the player changes ----
let film = true;
let slow = false;
let timeScale = 1;

const phaseEl = $('fr-phase-name');
const barEl = $('fr-bar');
const hintEl = $('fr-hint');
const soundBtn = $<HTMLButtonElement>('fr-sound');

let roamPose: { pos: THREE.Vector3; yaw: number; pitch: number; fly: boolean } | null = null;

function setFilm(on: boolean): void {
  if (!film && on) roamPose = { pos: controls.pos.clone(), yaw: controls.yaw, pitch: controls.pitch, fly: controls.fly };
  if (film && !on) {
    if (roamPose) {
      controls.pos.copy(roamPose.pos);
      controls.setLook(roamPose.yaw, roamPose.pitch);
      setFly(roamPose.fly);
    } else {
      // the first time out of the film you step in where its camera was, looking where it looked
      const dir = camera.getWorldDirection(new THREE.Vector3());
      controls.pos.copy(camera.position);
      controls.pos.y = Math.max(controls.pos.y, 1.7 + world.heightAt(controls.pos.x, controls.pos.z));
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
    localStorage.setItem('ds-hollow-loop', on ? '1' : '0');
  } catch {
    /* private mode */
  }
}
function setFly(on: boolean): void {
  controls.fly = on;
  $('fr-btn-fly').classList.toggle('on', on);
  document.body.classList.toggle('flying', on);
}
function toggleFly(): void {
  if (film) {
    setFilm(false);
    setFly(true);
  } else setFly(!controls.fly);
}
controls.onToggleFly = toggleFly;
controls.onInput = () => {
  if (film && started) setFilm(false);
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
    localStorage.setItem('ds-hollow-muted', m ? '1' : '0');
  } catch {
    /* private mode */
  }
}
try {
  if (localStorage.getItem('ds-hollow-muted') === '1') setMuted(true);
  setLoop(localStorage.getItem('ds-hollow-loop') !== '0');
} catch {
  setLoop(true);
}
document.body.classList.add('film');
$('fr-btn-film').classList.add('on');

director.onCue = (c, at) => audio.cue(c, at);

const unlock = (): void => audio.unlock();
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
addEventListener('touchstart', unlock, { passive: true });

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
fullBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
fullBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFull();
});
hold('fr-btn-loop', () => setLoop(!director.loop));
type Level = keyof typeof audio.volume;
function saveLevels(): void {
  try {
    localStorage.setItem('ds-hollow-volume', JSON.stringify(audio.volume));
  } catch {
    /* private mode */
  }
}
try {
  const saved = JSON.parse(localStorage.getItem('ds-hollow-volume') ?? '{}') as Partial<Record<Level, number>>;
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
for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click'] as const) volPanel.addEventListener(ev, (e) => e.stopPropagation());
canvas.addEventListener('pointerdown', () => showVolume(false));

hintEl.textContent = touch
  ? 'Left thumb: move · drag right side: look'
  : 'C leaves the film camera to walk · drag or click to look · WASD move · Shift run · Space jump · F (or Space twice) to fly · T slow motion · L loop on/off · R replay · M mute (the speaker sets volumes) · G full screen';

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

/** Until PLAY: the scene posed on Kael in the field, the Hollow on him, the camera circling him. */
let started = false;
const STILL_AT = 24.5;
let orbit = 2.6;

function frame(): void {
  if (!started) {
    orbit += Math.min(clock.getDelta(), 0.1) * 0.14;
    const at = cast.kael.root.position;
    const side = camera.aspect > 1.2 ? 1.0 : 0.15;
    camera.position.set(at.x + Math.sin(orbit) * 4.2, 1.5 + Math.sin(orbit * 0.7) * 0.2, at.z + Math.cos(orbit) * 4.2);
    camera.lookAt(at.x - Math.cos(orbit) * side, at.y + 1.3, at.z + Math.sin(orbit) * side);
    world.sky.position.copy(camera.position);
    world.update(elapsed, camera, director.fire);
    composer.render(0);
    return;
  }
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.1);
  const targetScale = slow ? 0.3 : 1;
  timeScale += (targetScale - timeScale) * Math.min(1, dt * 6);
  if (Math.abs(targetScale - timeScale) < 0.005) timeScale = targetScale;
  let sdt = dt * timeScale;
  // with the score playing, the scene runs on the score's clock
  const scoreAt = audio.position();
  if (scoreAt !== null && !director.held) {
    const lead = scoreAt - director.t;
    if (lead > -0.5 && lead < Math.max(2, raw * timeScale + 0.5)) sdt = Math.max(0, lead);
  }
  elapsed += sdt;

  director.update(sdt, elapsed);
  if (director.held && film && !heldOnce) {
    heldOnce = true;
    setFilm(false);
  }
  if (!director.held) heldOnce = false;

  if (film) director.film(camera);
  else {
    controls.update(dt, world.colliders, world.heightAt);
    controls.apply(camera);
  }
  const d = camera.position.distanceTo(director.shakeAt);
  const amp = director.shake * (film ? 0.2 : 0.1) * (1 / (1 + d / 30));
  if (amp > 0.001) camera.position.add(shakeV.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp));
  world.sky.position.copy(camera.position);
  world.update(elapsed, camera, director.fire);

  phaseEl.textContent = director.phase();
  if (director.held) heldFor += dt;
  else heldFor = 0;
  creditEl.classList.toggle('on', director.t >= 68.6 && director.t < 74.6 && heldFor < 10);
  barEl.style.transform = `scaleX(${(director.t / LOOP).toFixed(4)})`;

  audio.update(director.t, timeScale, director.held);

  composer.render(dt);

  if (gfx !== 'auto') return;
  if (dt > 1 / 40) (slowFrames++, (fastFrames = 0));
  else if (dt < 1 / 70) (fastFrames++, (slowFrames = 0));
  if (slowFrames > 45) {
    slowFrames = 0;
    if (ratio > minRatio) {
      ratio = Math.max(minRatio, ratio - 0.15);
      resize();
    } else if (useBloom) bloom.enabled = useBloom = false;
  } else if (fastFrames > 240 && (ratio < autoTop() || !useBloom)) {
    fastFrames = 0;
    if (!useBloom) bloom.enabled = useBloom = true;
    else ratio = Math.min(autoTop(), ratio + 0.1);
    resize();
  }
}

for (const b of Array.from(document.querySelectorAll<HTMLElement>('[data-gfx]'))) b.addEventListener('click', () => setGfx(b.dataset.gfx as Gfx));
setGfx(gfx);

/** Prepare every effect before the film starts (hidden ones too), so nothing hitches the first time it appears. */
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
statusEl.textContent = 'WAKING THE HOLLOW';
// the still: the scene posed on Kael in the field, drawn once the effects are prepared
director.t = STILL_AT;
director.update(0, 0);
const effects = warmUp().then(() => {
  effectsReady = true;
  showProgress();
  renderer.setAnimationLoop(frame);
});
const sound = audio.preload((done, total) => {
  soundShare = done / total;
  if (effectsReady) statusEl.textContent = `GATHERING THE VOICES  ${done} / ${total}`;
  showProgress();
});
void Promise.all([effects, sound]).then(() => {
  statusEl.textContent = 'THE NIGHT IS READY';
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
startEl.addEventListener('pointerdown', () => showVolume(false));
addEventListener('keydown', (e) => {
  if (!started && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    play();
  }
});
showVersionTag();
stayFresh();
reportVisit(touch, 'hollow');
// still private (only admins can open it): say so on the start screen
void loadAccount().then((a) => {
  if (filmAccess(a, 'hollow') === 'admin-only') $('fr-start').querySelector('.fr-start-kick')!.textContent = 'CINEMATICS  ·  ADMIN ONLY';
});

// for the browser checks
Object.assign(window, { __hollow: { director, controls, renderer, audio, scene, camera, world, cast, choir, village, grade, fx, setFilm, setFly, get ratio() { return ratio; }, get bloom() { return useBloom; } } });
