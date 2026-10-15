/**
 * The end of a won run on the Forge, after the boarding cinematic: the ending card (the Forge is quiet; who made it out,
 * who fell; Vulcan rises again), and then the reveal nobody sees coming. The fire was never the clan's fault: as the
 * helicopter climbs, the Ignis mark on the furnace door goes cold, the intake terminal under HQ counts what it lost and
 * what it kept, and PROMETHEUS - an orb of Vulcan iron with a furnace for a heart - tears up through Vulcan HQ's roof and
 * rises over the Forge. High above it all, with the whole map below (the hole in HQ's roof it came out of, the Hearth,
 * the Pad, and - as it names them - the seven furnaces lighting up one after another), it tells you what it did and
 * why. Then: "I will be back." It shoots up into the sky, becomes a star, and is gone. A moment of black, the credits.
 * It is never resolved.
 *
 * Only after a won run, on each player's own screen (nothing goes over the wire). The first time it cannot be skipped;
 * after that a SKIP button (or Esc / Enter) ends it. About 85 seconds; letterboxed; the HUD and weapons are hidden.
 */
import * as THREE from 'three';
import type { Game } from '../game/game';
import { IGNIS_ICON_URL, ignisMaterial } from '../world/layout/ignis';
import { createPrometheus, type PrometheusRig } from '../world/models/prometheus';
import { ENDING, REVEAL } from './lore';

const SEEN_KEY = 'ds-forge-reveal-seen';

function seenBefore(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // private mode: it just stays unskippable
  }
}

const CSS = `
.ds-reveal{position:absolute;inset:0;z-index:6;pointer-events:none;font-family:var(--ds-font-label, system-ui, sans-serif);color:#eef2f6}
.ds-reveal .bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height .9s ease}
.ds-reveal .bar.t{top:0}.ds-reveal .bar.b{bottom:0}
.ds-reveal[data-letterbox="1"] .bar{height:11vh}
.ds-reveal .sub{position:absolute;left:50%;bottom:14vh;transform:translateX(-50%);max-width:min(86vw,780px);text-align:center;font-size:clamp(15px,2.2vw,22px);letter-spacing:.03em;text-shadow:0 2px 8px rgba(0,0,0,.9);opacity:0;transition:opacity .5s}
.ds-reveal .sub b{color:#ffb060;font-weight:700;letter-spacing:.12em;margin-right:.5em}
.ds-reveal .sub.term{font-family:ui-monospace,'Courier New',monospace;color:#cfe8ff;letter-spacing:.14em;text-shadow:0 0 14px rgba(160,210,255,.8)}
.ds-reveal .sub.ai{color:#e8f4ff;font-weight:500;letter-spacing:.05em;text-shadow:0 0 18px rgba(150,205,255,.75),0 2px 8px rgba(0,0,0,.95)}
.ds-reveal .sub.ai b{color:#9fd8ff;letter-spacing:.3em}
.ds-reveal .sub.last{font-size:clamp(20px,3.2vw,34px);letter-spacing:.12em}
.ds-reveal .sub[data-show="1"]{opacity:1}
.ds-reveal .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.4vh;background:rgba(6,4,3,.82);opacity:0;transition:opacity 1s;padding:0 16px;text-align:center}
.ds-reveal .card[data-show="1"]{opacity:1}
.ds-reveal .card.black{background:#000}
.ds-reveal .card h2{margin:0;font-size:clamp(22px,4vw,44px);font-weight:700;letter-spacing:.14em;color:#ffe2c4}
.ds-reveal .card h3{margin:1.2vh 0 0;font-size:clamp(11px,1.4vw,14px);letter-spacing:.32em;color:#ff9a4a}
.ds-reveal .card .names{max-width:min(92vw,900px);display:flex;flex-wrap:wrap;justify-content:center;gap:6px 14px;font-size:clamp(13px,1.7vw,18px);color:#f2e6d8}
.ds-reveal .card .names.dim{color:#9a8a7a;font-size:clamp(12px,1.4vw,15px)}
.ds-reveal .card .names span small{display:block;font-size:.62em;letter-spacing:.18em;color:#c48a5a}
.ds-reveal .card .rises{margin-top:2vh;font-size:clamp(16px,2.4vw,26px);letter-spacing:.2em;color:#ffb060}
.ds-reveal .card img{width:clamp(48px,7vw,84px);height:auto;margin-bottom:.6vh;filter:drop-shadow(0 0 12px rgba(255,138,42,.6))}
.ds-reveal .card .credit{font-size:clamp(12px,1.5vw,15px);letter-spacing:.24em;color:#c8b8a8}
@media (max-height:480px){.ds-reveal .card{gap:.6vh}.ds-reveal .card h2{font-size:20px}.ds-reveal .card h3{margin-top:.4vh;font-size:10px}.ds-reveal .card .names{gap:2px 10px;font-size:12px}.ds-reveal .card .names.dim{font-size:11px}.ds-reveal .card img{width:34px}.ds-reveal .card .rises{margin-top:.6vh;font-size:14px}.ds-reveal .sub{bottom:13vh;font-size:13px}.ds-reveal .sub.last{font-size:18px}}
.ds-reveal .skip{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));pointer-events:auto;background:rgba(10,10,12,.7);border:1px solid rgba(255,255,255,.35);color:#eef2f6;font:600 13px/1 var(--ds-font-label, system-ui);letter-spacing:.2em;padding:12px 18px;min-height:44px;cursor:pointer}
`;

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** Where it hovers over HQ while it talks, and its size there (metres of radius). */
const HOVER_Y = 72;
const SIZE = 13;
/** When it starts to speak. */
const SPEAK = 32;

interface Ending {
  saved: { name: string; tag: string }[];
  fallen: { name: string; tag: string }[];
  left?: { name: string; tag: string }[];
  /** This run's seven furnaces (they light up as it names them). */
  furnaces?: { x: number; z: number; color: number }[];
}

export class RevealCinematic {
  private t = 0;
  private dt = 0;
  private el: HTMLElement | null = null;
  private sub: HTMLElement | null = null;
  private cards: Record<string, HTMLElement> = {};
  private model: PrometheusRig | null = null;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private camInit = false;
  private shakeT = 0;
  private fog0 = 0;
  private far0 = 0;
  /** Borrowed from the Forge's stage (a light added now would recompile every material): the furnace door, the orb. */
  private doorLight: THREE.PointLight | null = null;
  private orbLight: THREE.PointLight | null = null;
  private billboard0: { pos: THREE.Vector3; rot: THREE.Euler } | null = null;
  private played = new Set<string>();
  private drone: { stop(fade?: number): void } | null = null;
  private done = false;
  private readonly skippable: boolean;
  /** When each line of the speech starts, and when the last words, the launch and the end come. */
  private readonly lines: { at: number; until: number; text: string }[] = [];
  private readonly lastAt: number;
  private readonly launchAt: number;
  private readonly goneAt: number;
  /** Seconds the whole thing runs. */
  readonly length: number;
  private pillars: THREE.Mesh[] = [];
  private star: THREE.Mesh | null = null;
  private puffT = 0;
  onDone: () => void = () => {};

  constructor(
    private readonly g: Game,
    private readonly ending: Ending,
    private readonly voice: string,
  ) {
    this.skippable = seenBefore();
    let at = SPEAK;
    for (const text of REVEAL.speech) {
      const len = 2.8 + text.length / 30;
      this.lines.push({ at, until: at + len - 0.4, text });
      at += len;
    }
    this.lastAt = at + 0.6;
    this.launchAt = this.lastAt + 3.4;
    this.goneAt = this.launchAt + 2.8;
    this.length = this.goneAt + 8.5;
  }

  start(uiRoot: HTMLElement): void {
    const g = this.g;
    if (!document.getElementById('ds-reveal-css')) {
      const s = document.createElement('style');
      s.id = 'ds-reveal-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const el = document.createElement('div');
    el.className = 'ds-reveal';
    el.innerHTML = '<div class="bar t"></div><div class="bar b"></div>';
    const sub = document.createElement('div');
    sub.className = 'sub';
    el.appendChild(sub);
    this.sub = sub;
    // the ending card
    const end = document.createElement('div');
    end.className = 'card';
    const names = (list: { name: string; tag: string }[], dim: boolean): HTMLElement => {
      const d = document.createElement('div');
      d.className = dim ? 'names dim' : 'names';
      for (const p of list) {
        const sp = document.createElement('span');
        sp.textContent = p.name;
        const sm = document.createElement('small');
        sm.textContent = p.tag;
        sp.appendChild(sm);
        d.appendChild(sp);
      }
      return d;
    };
    const icon = document.createElement('img');
    icon.src = IGNIS_ICON_URL;
    icon.alt = '';
    const h2 = document.createElement('h2');
    h2.textContent = ENDING.quiet;
    const h3a = document.createElement('h3');
    h3a.textContent = ENDING.survived;
    end.append(icon, h2, h3a, names(this.ending.saved, false));
    if (this.ending.fallen.length > 0) {
      const h3b = document.createElement('h3');
      h3b.textContent = ENDING.fallen;
      end.append(h3b, names(this.ending.fallen, true));
    }
    if (this.ending.left && this.ending.left.length > 0) {
      const h3c = document.createElement('h3');
      h3c.textContent = ENDING.left;
      end.append(h3c, names(this.ending.left, true));
    }
    const rises = document.createElement('div');
    rises.className = 'rises';
    rises.textContent = ENDING.rises;
    end.appendChild(rises);
    // the black, and the credits
    const black = document.createElement('div');
    black.className = 'card black';
    const credits = document.createElement('div');
    credits.className = 'card black';
    credits.innerHTML = '<h2>THE FORGE</h2><div class="credit">MADE FOR VULCAN</div><div class="credit">VULCAN.GENXMIMS.ORG</div><div class="credit">THANK YOU FOR PLAYING</div>';
    el.append(end, black, credits);
    this.cards = { end, black, credits };
    if (this.skippable) {
      const skip = document.createElement('button');
      skip.className = 'skip';
      skip.type = 'button';
      skip.textContent = 'SKIP';
      skip.addEventListener('click', () => this.finish());
      el.appendChild(skip);
    }
    uiRoot.appendChild(el);
    this.el = el;
    // the world: fog thinned and the view drawn out far enough to hold the whole Forge and the sky over it
    const fog = g.renderer.scene.fog as THREE.FogExp2 | null;
    this.fog0 = fog?.density ?? 0;
    this.far0 = g.renderer.camera.far;
    g.renderer.camera.far = 2400;
    g.renderer.camera.updateProjectionMatrix();
    markSeen();
  }

  /** Esc / Enter: skip (only after the first viewing). */
  key(code: string): void {
    if (this.skippable && (code === 'Escape' || code === 'Enter' || code === 'Space')) this.finish();
  }

  get finished(): boolean {
    return this.done;
  }

  private show(id: string, on: boolean): void {
    const c = this.cards[id];
    if (c) c.dataset.show = on ? '1' : '0';
  }

  private say(text: string, who?: string, style: '' | 'term' | 'ai' | 'ai last' = ''): void {
    const s = this.sub!;
    s.className = style ? `sub ${style}` : 'sub';
    s.replaceChildren();
    if (who) {
      const b = document.createElement('b');
      b.textContent = who;
      s.appendChild(b);
    }
    s.appendChild(document.createTextNode(text));
    s.dataset.show = text ? '1' : '0';
  }

  private once(key: string, at: number, fn: () => void): void {
    if (this.t >= at && !this.played.has(key)) {
      this.played.add(key);
      fn();
    }
  }

  /** Which line of the speech is being said now (-1: none). */
  private lineNow(): number {
    for (let i = 0; i < this.lines.length; i++) if (this.t >= this.lines[i]!.at && this.t < this.lines[i]!.until + 0.4) return i;
    return -1;
  }

  /** Advance; returns false once it is over. */
  update(dt: number): boolean {
    if (this.done) return false;
    const g = this.g;
    this.dt = dt;
    this.t += dt;
    const t = this.t;
    const fx = g.level.forgeFx;
    const sites = g.level.data.forge!;
    const hq = sites.hq;
    const fog = g.renderer.scene.fog as THREE.FogExp2 | null;
    // ---- 0-8: the ending card over the climbing helicopter ----
    this.once('card', 0.2, () => this.show('end', true));
    this.once('cardOff', 7.6, () => this.show('end', false));
    this.once('cardGone', 9, () => {
      const c = this.cards.end;
      if (c) c.style.visibility = 'hidden';
    });
    this.once('letterbox', 8, () => {
      if (this.el) this.el.dataset.letterbox = '1';
    });
    // ---- 8.5: in the cabin ----
    this.once('over', 9.2, () => this.say(`"${REVEAL.over}"`, this.voice));
    this.once('overOff', 12.6, () => this.say(''));
    // ---- 13: the furnace door; the mark goes cold; the intake terminal ----
    this.once('cold', 14.5, () => {
      if (fx) fx.furnaceDoor.mark.material = ignisMaterial('cold');
      const lights = g.forge?.cinemaLights();
      if (lights) {
        [this.doorLight, this.orbLight] = lights;
        this.doorLight.color.setHex(0xcfe8ff);
        this.doorLight.intensity = 60;
        this.doorLight.distance = 9;
        this.doorLight.position.set(sites.furnace.x, 1.7, sites.furnace.z - 1.2);
      }
      g.audio.play('box_reveal', { priority: 3, volume: 0.8, rate: 0.6 });
    });
    this.once('term', 15.6, () => this.say(REVEAL.terminal, undefined, 'term'));
    this.once('termOff', 18.8, () => this.say(''));
    this.once('rumble', 17.5, () => {
      g.audio.play('amb_debris', { priority: 3, volume: 1.2, rate: 0.6 });
      this.shakeT = 1.5;
    });
    // ---- 19.6: it tears up through the roof ----
    this.once('burst', 19.6, () => {
      if (fx) {
        fx.furnaceDoor.left.rotation.y = -1.9;
        fx.furnaceDoor.right.rotation.y = 1.9;
        this.billboard0 = { pos: fx.billboard.position.clone(), rot: fx.billboard.rotation.clone() };
      }
      g.fx.explosion({ x: hq.x, y: hq.roofY, z: hq.z }, 9);
      g.fx.dust({ x: hq.x, y: hq.roofY, z: hq.z }, 1);
      g.audio.play('grenade_explosion', { priority: 3, volume: 1.4, rate: 0.55 });
      g.audio.play('warden_roar', { priority: 3, volume: 1.2, rate: 0.4 });
      this.shakeT = 2.4;
      // the one warmed up while the level loaded (so this frame builds nothing), or a new one
      this.model = g.forge?.takeOrb() ?? createPrometheus();
      this.model.cold(0);
      this.model.root.position.set(hq.x, hq.roofY - 2, hq.z);
      this.model.root.scale.setScalar(2.5);
      g.worldRoot.add(this.model.root);
      this.drone = g.audio.startLoop('transmitter', { volume: 0.9, rate: 0.42, fadeIn: 3 });
    });
    if (fx && this.billboard0 && t >= 19.6) {
      // the phoenix billboard is thrown off the roof
      const k = t - 19.6;
      const b = fx.billboard;
      b.position.set(this.billboard0.pos.x - k * 6, this.billboard0.pos.y + k * 9 - k * k * 4.5, this.billboard0.pos.z - k * 8);
      b.rotation.set(this.billboard0.rot.x - k * 1.4, this.billboard0.rot.y + k * 0.6, this.billboard0.rot.z + k * 0.9);
      if (b.position.y < -5) b.visible = false;
    }
    // the roof it came out of keeps smoking
    if (t > 20 && t < this.launchAt) {
      this.puffT -= dt;
      if (this.puffT <= 0) {
        this.puffT = 0.35;
        g.fx.dust({ x: hq.x + (Math.random() - 0.5) * 4, y: hq.roofY + 0.5, z: hq.z + (Math.random() - 0.5) * 4 }, 0.6);
        g.fx.sparkle({ x: hq.x, y: hq.roofY + 1, z: hq.z }, 0xff7a1a, 6);
      }
    }
    // ---- the speech ----
    this.lines.forEach((line, i) => {
      this.once(`line${i}`, line.at, () => {
        this.say(line.text, REVEAL.name, 'ai');
        g.audio.play('radio_chirp', { priority: 3, volume: 0.35, rate: 0.55 });
      });
      this.once(`line${i}off`, line.until, () => this.say(''));
    });
    // as it names the seven, the furnaces light up across the Forge, one after another
    const seven = this.lines[2];
    if (seven) {
      (this.ending.furnaces ?? []).forEach((f, i) => {
        this.once(`pillar${i}`, seven.at + 0.6 + i * 0.55, () => {
          const m = new THREE.Mesh(
            new THREE.CylinderGeometry(1.4, 2.2, 90, 12, 1, true),
            new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
          );
          m.position.set(f.x, 45, f.z);
          g.worldRoot.add(m);
          this.pillars.push(m);
          g.audio.play('objective_ping', { priority: 2, volume: 0.6, rate: 0.7 + i * 0.06 });
        });
      });
      for (const m of this.pillars) {
        const mm = m.material as THREE.MeshBasicMaterial;
        const k = t < seven.until + 4 ? Math.min(0.42, mm.opacity + dt * 0.8) : Math.max(0, mm.opacity - dt * 0.3);
        mm.opacity = k;
      }
    }
    this.once('last', this.lastAt, () => {
      this.say(REVEAL.last, REVEAL.name, 'ai last');
      g.audio.play('warden_roar', { priority: 3, volume: 0.7, rate: 0.32 });
      this.shakeT = 0.8;
    });
    this.once('lastOff', this.launchAt - 0.2, () => this.say(''));
    this.once('launch', this.launchAt, () => {
      g.audio.play('rpg_shot', { priority: 3, volume: 1.4, rate: 0.45 });
      g.audio.play('amb_thunder', { priority: 3, volume: 1.2, rate: 0.7 });
      this.shakeT = 1.2;
    });
    this.once('vanish', this.goneAt, () => {
      if (this.model) this.model.root.visible = false;
      if (this.orbLight) this.orbLight.intensity = 0;
      g.audio.play('box_reveal', { priority: 3, volume: 0.9, rate: 1.6 });
      // a star where it was, for a moment
      const star = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      if (this.model) star.position.copy(this.model.root.position);
      g.worldRoot.add(star);
      this.star = star;
      this.drone?.stop(1.2);
      this.drone = null;
    });
    if (this.star) {
      const k = (t - this.goneAt) / 1.6;
      const s = k < 0.15 ? 30 * (k / 0.15) : 30 * Math.max(0, 1 - (k - 0.15) / 0.85) + 4;
      this.star.scale.setScalar(Math.max(0.01, s));
      (this.star.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.6);
    }
    // ---- the orb ----
    const m = this.model;
    if (m && m.root.visible) {
      const rise = smooth((t - 19.6) / 10);
      const sc = 2.5 + (SIZE - 2.5) * rise;
      m.root.scale.setScalar(sc);
      let y = hq.roofY - 2 + (HOVER_Y - hq.roofY + 2) * rise + Math.sin(t * 0.6) * 1.2 * rise;
      const L = t - this.launchAt;
      if (L > 0) y += 0.5 * 70 * L * L;
      m.root.position.set(hq.x, y, hq.z);
      // its eye: on the helicopter as it rises, then on us while it talks, then up as it goes
      const heli = g.mission.heliRoot.position;
      const target = t < SPEAK - 1 ? heli : this.camPos;
      const want = Math.atan2(-(target.x - hq.x), -(target.z - hq.z));
      let d = want - m.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.root.rotation.y += d * Math.min(1, dt * 1.6);
      m.root.rotation.x = L > 0 ? Math.min(1.2, L * 0.8) : 0;
      m.cold(smooth((t - (SPEAK - 1.5)) / 1.5));
      const glow = t < SPEAK ? 0.7 + 0.3 * rise : t < this.launchAt ? 1.2 + (this.lineNow() >= 0 ? 0.25 : 0) : 2.2;
      m.update(dt, glow);
      // its light on the Forge below it (and on the street it came out of)
      const ol = this.orbLight;
      if (ol) {
        ol.color.setHex(t < SPEAK ? 0xff8a3a : 0xdcecff);
        ol.position.set(m.root.position.x, m.root.position.y - m.root.scale.x * 1.2, m.root.position.z);
        ol.distance = 60 * m.root.scale.x;
        ol.intensity = m.root.visible ? 90 * glow * m.root.scale.x * m.root.scale.x : 0;
      }
      if (fog) fog.density = this.fog0 * (1 - 0.88 * smooth((t - 20) / 6));
    }
    // the helicopter: up over the Forge, there for it to look at, then away
    if (t >= 22 && t < this.goneAt + 2) {
      const h = g.mission.heliRoot;
      const k = smooth((t - 22) / 12);
      const away = Math.max(0, t - 40) * 2.2;
      h.visible = true;
      h.position.set(-20 + k * 24 - away * 0.6, 70 + k * 30, -60 + k * 6 - away);
      h.rotation.y = Math.atan2(-(hq.x - h.position.x), -(hq.z - h.position.z)) + (t > 40 ? Math.PI * 0.8 : 0);
    }
    // ---- the end: silence, black, the credits ----
    this.once('silence', this.goneAt + 1.6, () => g.audio.stopAll());
    this.once('black', this.goneAt + 1.4, () => this.show('black', true));
    this.once('credits', this.goneAt + 3, () => {
      this.show('black', false);
      this.show('credits', true);
    });
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (t >= this.length) {
      this.finish();
      return false;
    }
    return true;
  }

  /** Where the camera wants to be and what it looks at, by the shot (eased between shots). */
  camera(cam: THREE.PerspectiveCamera): void {
    const g = this.g;
    const t = this.t;
    const sites = g.level.data.forge!;
    const hq = sites.hq;
    const f = sites.furnace;
    const h = sites.hearth;
    const lz = g.level.data.extraction;
    const P = this.pos;
    const L = this.look;
    const orb = this.model?.root.position ?? new THREE.Vector3(hq.x, HOVER_Y, hq.z);
    let ease = 1;
    if (t < 13) {
      // the cabin, climbing away from the Pad, looking back over the Forge toward HQ at dawn
      const k = smooth(t / 13);
      P.set(lz.heliX + 2, 28 + 16 * k, lz.heliZ - 4 - 10 * k);
      L.set(hq.x, 6, hq.z);
    } else if (t < 19.4) {
      // the furnace door, close
      const k = smooth((t - 13) / 6.4);
      P.set(f.x + 0.6 - 0.6 * k, 1.75, f.z - 3.2 + 1.2 * k);
      L.set(f.x, 1.65, f.z);
    } else if (t < 25) {
      // outside, in the street before HQ: it tears up through the roof
      P.set(hq.x - 10, 2, hq.z - 22);
      L.copy(orb);
    } else if (t < SPEAK - 0.5) {
      // pulling back and up: the whole Forge under it, the hole it came out of
      const k = smooth((t - 25) / (SPEAK - 25));
      P.set(hq.x - 60 - 70 * k, 25 + 55 * k, hq.z - 90 - 80 * k);
      L.set(hq.x, orb.y * 0.75, hq.z);
      ease = 0.12;
    } else if (t < this.launchAt) {
      // the speech: circling it high over the Forge, the map spread out below
      const i = Math.max(0, this.lineNow() >= 0 ? this.lineNow() : this.lines.findIndex((l) => l.at > t) - 1);
      const a = -2.3 + (t - SPEAK) * 0.04;
      const ring = (r: number, up: number): void => void P.set(orb.x + Math.sin(a) * r, orb.y + up, orb.z + Math.cos(a) * r);
      if (t >= this.lastAt - 0.3) {
        // the last words: right in front of the eye
        const e = this.model ? this.model.eye(new THREE.Vector3()) : orb;
        const dx = e.x - orb.x;
        const dz = e.z - orb.z;
        const dd = Math.hypot(dx, dz) || 1;
        P.set(e.x + (dx / dd) * 26, e.y + 2, e.z + (dz / dd) * 26);
        L.copy(e);
      } else if (i === 2) {
        // the seven names: high above, looking down over the whole Forge as the furnaces light up
        P.set(orb.x - 40, orb.y + 70, orb.z - 150);
        L.set(-5, 0, 0);
      } else if (i === 5) {
        // "what I left behind": from the hole in HQ's roof, up at it
        P.set(hq.x + 10, hq.roofY + 4, hq.z - 16);
        L.copy(orb);
      } else if (i <= 1) {
        ring(44, -6);
        L.copy(orb);
      } else {
        ring(78, 14);
        L.set(orb.x * 0.6, orb.y * 0.55, orb.z * 0.6);
      }
      ease = 0.05;
    } else {
      // it goes: from the Hearth, looking up as it leaves the sky
      P.set(h.gateX + 6, 2.2, h.gateZ + 10);
      L.copy(orb);
      ease = t < this.launchAt + 0.3 ? 0.2 : 1;
    }
    if (!this.camInit) {
      this.camPos.copy(P);
      this.camLook.copy(L);
      this.camInit = true;
    } else {
      // eased toward the shot, so the circling stays smooth (cuts stay cuts)
      const k = ease >= 1 ? 1 : 1 - Math.pow(1 - ease, Math.max(1, this.dt * 60));
      if (P.distanceTo(this.camPos) > 120 && ease < 1) this.camPos.copy(P);
      this.camPos.lerp(P, k);
      this.camLook.lerp(L, Math.min(1, k * 1.6));
    }
    cam.position.copy(this.camPos);
    if (this.shakeT > 0) {
      const s = this.shakeT * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.camLook);
  }

  /** Over: clear everything up (the results come next). */
  finish(): void {
    if (this.done) return;
    this.done = true;
    const g = this.g;
    this.drone?.stop(0.3);
    this.drone = null;
    this.el?.remove();
    this.el = null;
    const fog = g.renderer.scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = this.fog0;
    g.renderer.camera.far = this.far0;
    g.renderer.camera.updateProjectionMatrix();
    if (this.model) {
      if (g.forge) g.forge.returnOrb(this.model);
      else this.model.dispose();
    }
    this.model = null;
    for (const p of this.pillars) {
      p.removeFromParent();
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.pillars = [];
    if (this.star) {
      this.star.removeFromParent();
      this.star.geometry.dispose();
      (this.star.material as THREE.Material).dispose();
      this.star = null;
    }
    for (const l of [this.doorLight, this.orbLight]) if (l) l.intensity = 0;
    const fx = g.level.forgeFx;
    if (fx) {
      fx.furnaceDoor.mark.material = ignisMaterial('dim');
      fx.furnaceDoor.left.rotation.y = 0;
      fx.furnaceDoor.right.rotation.y = 0;
      if (this.billboard0) {
        fx.billboard.position.copy(this.billboard0.pos);
        fx.billboard.rotation.copy(this.billboard0.rot);
        fx.billboard.visible = true;
      }
    }
    this.onDone();
  }
}
