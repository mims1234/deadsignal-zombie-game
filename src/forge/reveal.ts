/**
 * The end of a won run on the Forge, after the boarding cinematic: the ending card (the Forge is quiet; who made it out,
 * who fell; Vulcan rises again), and then the reveal nobody sees coming. The fire was never the clan's fault: as the
 * helicopter climbs, the Ignis mark on the furnace door relights cold white, IGNIS EARNING comes back ON, and PROMETHEUS
 * tears up through Vulcan HQ's roof, rises over the Forge, looks at the helicopter for one beat, turns away and leaves.
 * A black card, one line, the credits. It is never resolved - no "to be continued".
 *
 * Only after a won run, on each player's own screen (nothing goes over the wire). The first time it cannot be skipped;
 * after that a SKIP button (or Esc / Enter) ends it. About 55 seconds; letterboxed; the HUD and weapons are hidden.
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
.ds-reveal .sub{position:absolute;left:50%;bottom:14vh;transform:translateX(-50%);max-width:min(86vw,760px);text-align:center;font-size:clamp(15px,2.2vw,22px);letter-spacing:.03em;text-shadow:0 2px 8px rgba(0,0,0,.9);opacity:0;transition:opacity .5s}
.ds-reveal .sub b{color:#ffb060;font-weight:700;letter-spacing:.12em;margin-right:.5em}
.ds-reveal .sub.term{font-family:ui-monospace,'Courier New',monospace;color:#cfe8ff;letter-spacing:.2em;text-shadow:0 0 14px rgba(160,210,255,.8)}
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
.ds-reveal .card .line{font-size:clamp(18px,3vw,32px);letter-spacing:.06em;color:#f4f6f8;font-weight:500}
.ds-reveal .card .credit{font-size:clamp(12px,1.5vw,15px);letter-spacing:.24em;color:#c8b8a8}
@media (max-height:480px){.ds-reveal .card{gap:.6vh}.ds-reveal .card h2{font-size:20px}.ds-reveal .card h3{margin-top:.4vh;font-size:10px}.ds-reveal .card .names{gap:2px 10px;font-size:12px}.ds-reveal .card .names.dim{font-size:11px}.ds-reveal .card img{width:34px}.ds-reveal .card .rises{margin-top:.6vh;font-size:14px}.ds-reveal .sub{bottom:13vh;font-size:13px}}
.ds-reveal .skip{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));pointer-events:auto;background:rgba(10,10,12,.7);border:1px solid rgba(255,255,255,.35);color:#eef2f6;font:600 13px/1 var(--ds-font-label, system-ui);letter-spacing:.2em;padding:12px 18px;min-height:44px;cursor:pointer}
`;

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

export class RevealCinematic {
  private t = 0;
  private el: HTMLElement | null = null;
  private sub: HTMLElement | null = null;
  private cards: Record<string, HTMLElement> = {};
  private model: PrometheusRig | null = null;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private shakeT = 0;
  private fog0 = 0;
  private far0 = 0;
  private coldLight: THREE.PointLight | null = null;
  private billboard0: { pos: THREE.Vector3; rot: THREE.Euler } | null = null;
  private played = new Set<string>();
  private drone: { stop(fade?: number): void } | null = null;
  private done = false;
  private readonly skippable: boolean;
  /** Seconds the whole thing runs. */
  readonly length = 56;
  onDone: () => void = () => {};

  constructor(
    private readonly g: Game,
    private readonly ending: { saved: { name: string; tag: string }[]; fallen: { name: string; tag: string }[]; left?: { name: string; tag: string }[] },
    private readonly voice: string,
  ) {
    this.skippable = seenBefore();
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
    // the black card and the credits
    const black = document.createElement('div');
    black.className = 'card black';
    const line = document.createElement('div');
    line.className = 'line';
    line.textContent = REVEAL.last;
    black.appendChild(line);
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
    // the world: fog thinned and the view drawn out far enough to hold something this big
    const fog = g.renderer.scene.fog as THREE.FogExp2 | null;
    this.fog0 = fog?.density ?? 0;
    this.far0 = g.renderer.camera.far;
    g.renderer.camera.far = 1600;
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

  private say(text: string, who?: string, term = false): void {
    const s = this.sub!;
    s.className = term ? 'sub term' : 'sub';
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

  /** Advance; returns false once it is over. */
  update(dt: number): boolean {
    if (this.done) return false;
    const g = this.g;
    this.t += dt;
    const t = this.t;
    const fx = g.level.forgeFx;
    const sites = g.level.data.forge!;
    const hq = sites.hq;
    const fog = g.renderer.scene.fog as THREE.FogExp2 | null;
    // ---- 0-8: the ending card over the climbing helicopter ----
    this.once('card', 0.2, () => this.show('end', true));
    this.once('cardOff', 7.6, () => this.show('end', false));
    // once faded, gone (nothing of it may linger over the shots that follow)
    this.once('cardGone', 9, () => {
      const c = this.cards.end;
      if (c) c.style.visibility = 'hidden';
    });
    this.once('blackGone', 53, () => {
      const c = this.cards.black;
      if (c) c.style.visibility = 'hidden';
    });
    this.once('letterbox', 8, () => {
      if (this.el) this.el.dataset.letterbox = '1';
    });
    // ---- 8.5: in the cabin ----
    this.once('over', 9.2, () => this.say(`"${REVEAL.over}"`, this.voice));
    this.once('overOff', 12.6, () => this.say(''));
    // ---- 13: the furnace door; the mark relights cold; the terminal ----
    this.once('cold', 14.5, () => {
      if (fx) fx.furnaceDoor.mark.material = ignisMaterial('cold');
      const l = new THREE.PointLight(0xcfe8ff, 60, 9, 2);
      l.position.set(sites.furnace.x, 1.7, sites.furnace.z - 1.2);
      g.worldRoot.add(l);
      this.coldLight = l;
      g.audio.play('box_reveal', { priority: 3, volume: 0.8, rate: 0.6 });
    });
    this.once('term', 16, () => this.say(REVEAL.terminal, undefined, true));
    this.once('termOff', 18.6, () => this.say(''));
    this.once('rumble', 17.5, () => {
      g.audio.play('amb_debris', { priority: 3, volume: 1.2, rate: 0.6 });
      this.shakeT = 1.5;
    });
    // ---- 19: it tears up through the roof ----
    this.once('burst', 19.6, () => {
      if (fx) {
        fx.furnaceDoor.left.rotation.y = -1.9;
        fx.furnaceDoor.right.rotation.y = 1.9;
        this.billboard0 = { pos: fx.billboard.position.clone(), rot: fx.billboard.rotation.clone() };
      }
      g.fx.explosion({ x: hq.x, y: hq.roofY, z: hq.z }, 9);
      g.fx.dust({ x: hq.x, y: hq.roofY, z: hq.z }, 1);
      g.audio.play('grenade_explosion', { priority: 3, volume: 1.4, rate: 0.55 });
      g.audio.play('warden_roar', { priority: 3, volume: 1.4, rate: 0.45 });
      this.shakeT = 2.4;
      this.model = createPrometheus();
      this.model.root.position.set(hq.x, -40, hq.z);
      this.model.root.scale.setScalar(6);
      g.worldRoot.add(this.model.root);
      this.drone = g.audio.startLoop('transmitter', { volume: 0.9, rate: 0.42, fadeIn: 3 });
    });
    const m = this.model;
    if (fx && this.billboard0 && t >= 19.6) {
      // the phoenix billboard is thrown off the roof
      const k = t - 19.6;
      const b = fx.billboard;
      b.position.set(this.billboard0.pos.x - k * 6, this.billboard0.pos.y + k * 9 - k * k * 4.5, this.billboard0.pos.z - k * 8);
      b.rotation.set(this.billboard0.rot.x - k * 1.4, this.billboard0.rot.y + k * 0.6, this.billboard0.rot.z + k * 0.9);
      if (b.position.y < -5) b.visible = false;
    }
    if (m) {
      // rising: up out of the hall, growing to its full height (some 200 m), then turning to look, then leaving
      const rise = smooth((t - 19.6) / 11);
      const sc = 6 + 16 * rise;
      m.root.scale.setScalar(sc);
      let y = -40 + 40 * rise;
      let x = hq.x;
      let z = hq.z;
      let yaw = 0;
      const look = smooth((t - 33) / 2.5);
      const away = smooth((t - 38.5) / 9);
      yaw = Math.PI * 0.85 * look * (1 - smooth((t - 37.5) / 1.5)) + Math.PI * away;
      x += away * 380;
      z += away * 520;
      y += away * 180;
      m.root.position.set(x, y, z);
      m.root.rotation.y = yaw;
      const glow = t < 33 ? 0.7 + 0.3 * rise : t < 37.5 ? 1.6 : Math.max(0.2, 1 - away);
      m.update(dt, glow);
      if (fog) fog.density = this.fog0 * (1 - 0.85 * smooth((t - 20) / 6)) * (1 + 1.5 * away);
    }
    // the helicopter: up over the Forge for the long shot, and there for it to look at
    if (t >= 24 && t < 47) {
      const h = g.mission.heliRoot;
      const k = smooth((t - 24) / 10);
      h.visible = true;
      h.position.set(-20 + k * 30, 70 + k * 40, -60 + k * 10);
      h.rotation.y = Math.atan2(-(hq.x - h.position.x), -(hq.z - h.position.z));
    }
    this.once('look', 33.5, () => {
      g.audio.play('warden_roar', { priority: 3, volume: 0.6, rate: 0.35 });
      this.shakeT = 0.6;
    });
    this.once('leave', 39, () => g.audio.play('amb_thunder', { priority: 3, volume: 1.2, rate: 0.6 }));
    // ---- 47: silence, the black card; 52: the credits ----
    this.once('silence', 46.5, () => g.audio.stopAll());
    this.once('black', 47, () => this.show('black', true));
    this.once('blackOff', 51.6, () => this.show('black', false));
    this.once('credits', 52, () => this.show('credits', true));
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (t >= this.length) {
      this.finish();
      return false;
    }
    return true;
  }

  /** Where the camera is and what it looks at, by the shot. */
  camera(cam: THREE.PerspectiveCamera): void {
    const g = this.g;
    const t = this.t;
    const sites = g.level.data.forge!;
    const hq = sites.hq;
    const f = sites.furnace;
    const lz = g.level.data.extraction;
    const P = this.pos;
    const L = this.look;
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
      L.set(hq.x, 14 + (t - 19.4) * 9, hq.z);
    } else if (t < 33) {
      // pulling back and up to hold the whole of it
      const k = smooth((t - 25) / 8);
      P.set(hq.x - 40 - 50 * k, 20 + 90 * k, hq.z - 90 - 120 * k);
      L.set(hq.x, 60 + 60 * k, hq.z);
    } else {
      // from just behind the helicopter, past it: it looks at us (then turns away and leaves over the skyline)
      const h = g.mission.heliRoot.position;
      const m = this.model?.root.position ?? new THREE.Vector3(hq.x, 0, hq.z);
      const dx = h.x - m.x;
      const dz = h.z - m.z;
      const d = Math.hypot(dx, dz) || 1;
      P.set(h.x + (dx / d) * 14 - (dz / d) * 4, h.y + 4, h.z + (dz / d) * 14 + (dx / d) * 4);
      if (this.model && t < 38.5) this.model.eye(L);
      else if (this.model) L.copy(m).add(new THREE.Vector3(0, 120 * (this.model.root.scale.x / 22), 0));
      else L.set(hq.x, 180, hq.z);
    }
    if (this.shakeT > 0) {
      const a = this.shakeT * 0.35;
      P.x += (Math.random() - 0.5) * a;
      P.y += (Math.random() - 0.5) * a;
    }
    cam.position.copy(P);
    cam.lookAt(L);
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
    this.model?.dispose();
    this.model = null;
    this.coldLight?.removeFromParent();
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
