/**
 * The Asylum's own HUD pieces, added into the game HUD's DOM (so they hide with it): a small time-of-day chip under
 * the mission clock (sun, setting sun, moon or rising sun, the phase, and a bar running to the next change) and the
 * note card that shows a recovered patient file's text for a while. Nothing here takes input.
 */
import type { DayPhase } from '../logic/timeOfDay';
import type { RecordNote } from './lore';

const ICONS: Record<DayPhase, string> = {
  day: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1.2v1.8M8 13v1.8M1.2 8h1.8M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M3.2 12.8l1.3-1.3M11.5 4.5l1.3-1.3"/></g></svg>',
  dusk: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 11a4.4 4.4 0 0 1 8.8 0z" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M1 13.2h14M8 3v1.6M2.6 6.4l1.1 1.1M13.4 6.4l-1.1 1.1"/></g></svg>',
  night: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.8 2.2a6 6 0 1 0 3 9.8A5 5 0 0 1 10.8 2.2z" fill="currentColor"/></svg>',
  dawn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 12a4.4 4.4 0 0 1 8.8 0z" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M1 14h14M8 1.6v4M6.2 3.4 8 1.6l1.8 1.8"/></g></svg>',
};

const LABEL: Record<DayPhase, string> = { day: 'DAY', dusk: 'DUSK', night: 'NIGHT', dawn: 'DAWN' };

const CSS = `
.ds-tod{display:flex;align-items:center;justify-content:center;gap:7px;margin:5px auto 0;padding:3px 10px 3px 8px;width:max-content;font-family:var(--ds-font-label);font-weight:600;font-size:11px;letter-spacing:.2em;color:#d9dcc4}
.ds-tod svg{width:15px;height:15px;display:block}
.ds-tod .bar{width:46px;height:3px;background:var(--ds-line);position:relative;overflow:hidden}
.ds-tod .bar i{position:absolute;inset:0;transform-origin:left center;background:currentColor;opacity:.85}
.ds-tod[data-phase=day]{color:#eadfb4}
.ds-tod[data-phase=dusk]{color:#eba25e}
.ds-tod[data-phase=night]{color:#a8bde0}
.ds-tod[data-phase=dawn]{color:#f2b9a2}
.ds-note{position:absolute;left:24px;top:28%;max-width:360px;padding:14px 16px 10px;background:rgba(222,213,188,.95);color:#2b241a;font-family:'Courier New',ui-monospace,monospace;font-size:13px;line-height:1.45;text-transform:none;letter-spacing:0;box-shadow:0 8px 28px rgba(0,0,0,.55);transform:rotate(-.6deg) translateX(-12px);opacity:0;transition:opacity .6s,transform .6s;pointer-events:none;z-index:4}
.ds-note[data-show="1"]{opacity:1;transform:rotate(-.6deg)}
.ds-note h4{margin:0 64px 3px 0;font-family:var(--ds-font-label);font-weight:700;font-size:14px;letter-spacing:.12em;color:#5b1c14}
.ds-note .src{font-size:11px;color:#6b6049;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(60,48,28,.3)}
.ds-note p{margin:0 0 7px}
.ds-note .stamp{position:absolute;right:10px;top:9px;font-family:var(--ds-font-label);font-weight:700;font-size:10px;letter-spacing:.14em;color:rgba(150,32,22,.8);border:1.5px solid rgba(150,32,22,.65);padding:1px 5px;transform:rotate(5deg)}
@media (max-width:700px){.ds-note{left:12px;right:12px;max-width:none;top:20%;font-size:12px}}
`;

export class NightHud {
  private chip: HTMLElement | null = null;
  private chipIcon: HTMLElement | null = null;
  private chipLabel: HTMLElement | null = null;
  private chipBar: HTMLElement | null = null;
  private note: HTMLElement | null = null;
  private noteLeft = 0;
  private shownPhase: DayPhase | null = null;
  private shownBar = -1;

  /** Build the pieces once the game HUD exists. False while it does not (headless, before mount). */
  private ensure(): boolean {
    if (this.chip) return this.chip.isConnected;
    if (typeof document === 'undefined') return false;
    const hud = document.querySelector('.ds-hud');
    const top = hud?.querySelector('.ds-topcenter');
    if (!hud || !top) return false;
    if (!document.getElementById('ds-asylum-css')) {
      const style = document.createElement('style');
      style.id = 'ds-asylum-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const chip = document.createElement('div');
    chip.className = 'ds-tod ds-panel';
    chip.setAttribute('aria-label', 'Time of day');
    this.chipIcon = document.createElement('span');
    this.chipLabel = document.createElement('span');
    const bar = document.createElement('span');
    bar.className = 'bar';
    this.chipBar = document.createElement('i');
    bar.appendChild(this.chipBar);
    chip.append(this.chipIcon, this.chipLabel, bar);
    // under the mission clock
    const clocks = top.querySelector('.ds-clocks');
    if (clocks?.nextSibling) top.insertBefore(chip, clocks.nextSibling);
    else top.appendChild(chip);
    this.chip = chip;
    const note = document.createElement('div');
    note.className = 'ds-note';
    note.setAttribute('role', 'note');
    hud.appendChild(note);
    this.note = note;
    return true;
  }

  /** `toNext`: 0..1 of the way to the next change of light (1 when there is none to show). */
  update(dt: number, phase: DayPhase, toNext: number): void {
    if (!this.ensure()) return;
    if (phase !== this.shownPhase) {
      this.shownPhase = phase;
      this.chip!.dataset.phase = phase;
      this.chipIcon!.innerHTML = ICONS[phase];
      this.chipLabel!.textContent = LABEL[phase];
    }
    const b = Math.round(Math.max(0, Math.min(1, toNext)) * 100) / 100;
    if (b !== this.shownBar) {
      this.shownBar = b;
      this.chipBar!.style.transform = `scaleX(${b})`;
    }
    if (this.noteLeft > 0) {
      this.noteLeft -= dt;
      if (this.noteLeft <= 0) this.note!.dataset.show = '0';
    }
  }

  /** Show a recovered file for `seconds`. */
  showNote(n: RecordNote, index: number, total: number, seconds = 18): void {
    if (!this.ensure()) return;
    const note = this.note!;
    note.replaceChildren();
    const stamp = document.createElement('span');
    stamp.className = 'stamp';
    stamp.textContent = `FILE ${index + 1}/${total}`;
    const h = document.createElement('h4');
    h.textContent = n.title;
    const src = document.createElement('div');
    src.className = 'src';
    src.textContent = n.source;
    note.append(stamp, h, src);
    for (const para of n.body.split('\n\n')) {
      const p = document.createElement('p');
      p.textContent = para;
      note.appendChild(p);
    }
    note.dataset.show = '1';
    this.noteLeft = seconds;
  }

  hideNote(): void {
    this.noteLeft = 0;
    if (this.note) this.note.dataset.show = '0';
  }

  dispose(): void {
    this.chip?.remove();
    this.note?.remove();
    this.chip = this.note = null;
  }
}
