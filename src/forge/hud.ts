/**
 * The Forge's own HUD pieces, added into the game HUD's DOM (so they hide with it): the note card (a ledger page, or
 * the note on a holdout's door) with the Ignis mark, and the bar over the reborn. Nothing here takes input.
 */
import { IGNIS_ICON_URL } from '../world/layout/ignis';

const CSS = `
.ds-fnote{position:absolute;left:24px;top:26%;max-width:380px;padding:14px 16px 10px 16px;background:linear-gradient(180deg,rgba(38,22,14,.95),rgba(24,13,8,.95));border:1px solid rgba(255,138,58,.45);color:#f2dcc4;font-family:'Courier New',ui-monospace,monospace;font-size:13px;line-height:1.45;letter-spacing:0;text-transform:none;box-shadow:0 10px 32px rgba(0,0,0,.6),0 0 24px rgba(255,106,26,.12) inset;transform:translateX(-12px);opacity:0;transition:opacity .5s,transform .5s;pointer-events:none;z-index:4}
.ds-fnote[data-show="1"]{opacity:1;transform:none}
.ds-fnote .ig{position:absolute;right:10px;top:8px;width:34px;height:34px;background-size:contain;background-repeat:no-repeat;background-position:center;opacity:.9}
.ds-fnote h4{margin:0 44px 3px 0;font-family:var(--ds-font-label);font-weight:700;font-size:14px;letter-spacing:.12em;color:#ffb060}
.ds-fnote .src{font-size:11px;color:#c49a74;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,138,58,.25)}
.ds-fnote p{margin:0 0 7px;white-space:pre-line}
.ds-fnote .tag{font-family:var(--ds-font-label);font-weight:700;font-size:10px;letter-spacing:.16em;color:#ff7a3a;margin-bottom:4px}
@media (max-width:820px),(max-height:480px){.ds-fnote{left:50%;right:auto;width:min(340px,62vw);max-width:none;top:24%;font-size:11px;line-height:1.35;padding:8px 10px 4px;transform:translate(-50%,-8px)}.ds-fnote[data-show="1"]{transform:translate(-50%,0)}.ds-fnote h4{font-size:11px;margin-right:30px}.ds-fnote .ig{width:22px;height:22px;right:8px;top:6px}.ds-fnote .src{font-size:10px;margin-bottom:5px;padding-bottom:4px}.ds-fnote p{margin:0 0 4px}}
@media (max-height:480px){.ds-fnote{top:20%;max-height:56%;overflow:hidden}}
`;

export interface NoteCard {
  tag?: string;
  title: string;
  source?: string;
  body: string;
}

export class ForgeHud {
  private note: HTMLElement | null = null;
  private left = 0;

  private ensure(): boolean {
    if (this.note) return this.note.isConnected;
    if (typeof document === 'undefined') return false;
    const hud = document.querySelector('.ds-hud');
    if (!hud) return false;
    if (!document.getElementById('ds-forge-css')) {
      const style = document.createElement('style');
      style.id = 'ds-forge-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const note = document.createElement('div');
    note.className = 'ds-fnote';
    note.setAttribute('role', 'note');
    hud.appendChild(note);
    this.note = note;
    return true;
  }

  /** Show a note for `seconds`. */
  show(n: NoteCard, seconds = 14): void {
    if (!this.ensure()) return;
    const el = this.note!;
    el.replaceChildren();
    const ig = document.createElement('span');
    ig.className = 'ig';
    ig.style.backgroundImage = `url("${IGNIS_ICON_URL}")`;
    el.appendChild(ig);
    if (n.tag) {
      const t = document.createElement('div');
      t.className = 'tag';
      t.textContent = n.tag;
      el.appendChild(t);
    }
    const h = document.createElement('h4');
    h.textContent = n.title;
    el.appendChild(h);
    if (n.source) {
      const src = document.createElement('div');
      src.className = 'src';
      src.textContent = n.source;
      el.appendChild(src);
    }
    for (const para of n.body.split('\n\n')) {
      const p = document.createElement('p');
      p.textContent = para;
      el.appendChild(p);
    }
    el.dataset.show = '1';
    this.left = seconds;
  }

  hide(): void {
    this.left = 0;
    if (this.note) this.note.dataset.show = '0';
  }

  update(dt: number): void {
    if (this.left > 0) {
      this.left -= dt;
      if (this.left <= 0 && this.note) this.note.dataset.show = '0';
    }
  }

  dispose(): void {
    this.note?.remove();
    this.note = null;
  }
}
