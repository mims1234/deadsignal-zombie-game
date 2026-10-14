/**
 * The row of running power-ups (insta-kill, double points) above the bottom of the screen: emblem, name and seconds
 * left, blinking through the last five seconds. Builds its own DOM (and a few lines of CSS) inside the HUD root, so
 * hiding the HUD hides it too.
 */
import type { TimedPowerup } from '../logic/powerups';
import { POWERUP_STYLE, powerupIcon } from './powerupIcons';

const CSS = `
.ds-powerups { position: absolute; left: 0; right: 0; bottom: 19%; margin-inline: auto; width: max-content; display: flex; gap: 14px; pointer-events: none; }
.ds-powerups .pu { display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; background: rgba(9, 12, 10, 0.72); border: 1px solid var(--pc); border-radius: 22px; color: var(--pc); font-family: var(--ds-font-label, sans-serif); letter-spacing: 0.14em; font-weight: 700; font-size: 13px; box-shadow: 0 0 14px color-mix(in srgb, var(--pc) 35%, transparent); }
.ds-powerups .pu img { width: 34px; height: 34px; }
.ds-powerups .pu .t { font-family: var(--ds-font-num, monospace); color: #e6ecdc; min-width: 2.2em; text-align: right; }
.ds-powerups .pu.blink { animation: ds-pu-blink 0.5s steps(2, end) infinite; }
@keyframes ds-pu-blink { 50% { opacity: 0.25; } }
`;

export class PowerupHud {
  private readonly root: HTMLDivElement;
  private readonly chips = new Map<TimedPowerup, { el: HTMLDivElement; t: HTMLSpanElement; shown: number; blink: boolean }>();

  constructor(parent: HTMLElement) {
    if (!document.getElementById('ds-powerups-css')) {
      const style = document.createElement('style');
      style.id = 'ds-powerups-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'ds-powerups';
    parent.appendChild(this.root);
    for (const k of ['doublePoints', 'instaKill'] as const) {
      const st = POWERUP_STYLE[k];
      const el = document.createElement('div');
      el.className = 'pu';
      el.style.setProperty('--pc', st.color);
      el.hidden = true;
      const img = document.createElement('img');
      img.alt = '';
      img.src = powerupIcon(k).toDataURL();
      const name = document.createElement('span');
      name.textContent = st.name;
      const t = document.createElement('span');
      t.className = 't';
      el.append(img, name, t);
      this.root.appendChild(el);
      this.chips.set(k, { el, t, shown: -1, blink: false });
    }
  }

  /** Show the timers (seconds left per timed power-up; 0 = off). Change-detected: cheap every frame. */
  update(timers: Readonly<Record<TimedPowerup, number>>): void {
    for (const [k, c] of this.chips) {
      const left = timers[k];
      const secs = left > 0 ? Math.ceil(left) : 0;
      if (secs === c.shown) continue;
      c.shown = secs;
      c.el.hidden = secs <= 0;
      c.t.textContent = `${secs}s`;
      const blink = secs > 0 && secs <= 5;
      if (blink !== c.blink) {
        c.blink = blink;
        c.el.classList.toggle('blink', blink);
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
