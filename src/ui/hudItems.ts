/**
 * Item pictures on the HUD (ZARYA's parts, finds and tools, round 3): a round painted badge in a feed line, beside a
 * banner's title or the phone's top line, a strip of them on an objective row ("BUILD THE SALYUT" and the parts still
 * missing), and the workbench card: a small panel in the right-hand column, under the objectives, that shows what can
 * be built from what is held while a player stands at a bench.
 *
 * Only a map that hands the HUD an icon (an `icon` on a feed or banner event, `icons` on an objective, `itemCard` in
 * the state) shows any of this, so every other map looks exactly as before. The styles are its own, added once when
 * the HUD is built (they style nothing another map draws).
 */
import { el, setHidden } from './dom';

/** One picture: `dim` when it is not held yet (grey and dark), with what it is for a screen reader. */
export interface HudIcon {
  src: string;
  dim?: boolean;
  label?: string;
}

/** The workbench card: a title ("WORKBENCH"), then a row a thing to build: its name, its parts, and a short word. */
export interface ItemCard {
  title: string;
  sub?: string;
  rows: { name: string; icons: HudIcon[]; note: string; ready?: boolean }[];
}

const CSS = `
.ds-ico{width:1.7em;height:1.7em;border-radius:50%;flex:none;display:inline-block;vertical-align:middle;object-fit:contain;
  box-shadow:0 1px 3px rgba(0,0,0,.6)}
.ds-ico.dim{filter:grayscale(1) brightness(.5);opacity:.62;box-shadow:none}
.ds-icons{display:flex;flex-wrap:wrap;gap:.22em;align-items:center}
.ds-feed-line.has-ico{display:flex;align-items:center;gap:.5em;padding-left:.3em}
.ds-feed-line.has-ico .ds-ico{width:max(20px,2.1em);height:max(20px,2.1em)}
.ds-banner .ds-ico.lead{width:2.6em;height:2.6em;margin:0 auto .25em;display:block}
.ds-topline .ds-ico.lead{width:1.65em;height:1.65em;align-self:center;margin-right:-.25em}
.ds-obj-row .ds-icons{margin:.28em 0 .05em}
.ds-obj-row .ds-icons .ds-ico{width:max(20px,1.75em);height:max(20px,1.75em)}
.ds-itemcard{font-size:.92em}
.ds-itemcard .head{white-space:nowrap;display:flex;justify-content:space-between;align-items:baseline;gap:.6em;padding:.42em .8em .36em;
  font-size:max(9px,.82em);letter-spacing:.24em;color:var(--ds-amber);border-bottom:1px solid var(--ds-line);
  background:linear-gradient(90deg,rgba(226,176,74,.14),transparent 75%)}
.ds-itemcard .head .sub{color:var(--ds-ink-faint);letter-spacing:.12em;font-size:.9em;text-align:right}
.ds-itemcard .row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:.1em .6em;padding:.38em .8em}
.ds-itemcard .row+.row{border-top:1px solid rgba(255,255,255,.06)}
.ds-itemcard .name{font-size:.84em;letter-spacing:.14em;color:var(--ds-ink)}
.ds-itemcard .note{font-size:.76em;letter-spacing:.1em;color:var(--ds-ink-faint);text-align:right;white-space:nowrap}
.ds-itemcard .row.ready .name,.ds-itemcard .row.ready .note{color:var(--ds-green)}
.ds-itemcard .ds-icons{grid-column:1 / -1}
.ds-itemcard .ds-ico{width:max(24px,2em);height:max(24px,2em)}
.ds-jbuild{font-size:12px;margin:2px 0 6px}
.ds-jbuild .head{margin:8px 0 4px;letter-spacing:.06em;opacity:.95}
.ds-jbuild .parts{display:flex;flex-wrap:wrap;gap:8px 10px}
.ds-jbuild .part{width:7.2em;display:flex;flex-direction:column;align-items:center;text-align:center;line-height:1.25}
.ds-jbuild .part .ds-ico{width:44px;height:44px;margin-bottom:3px}
.ds-jbuild .part .name{font-size:11px;font-weight:600}
.ds-jbuild .part .where{font-size:10px;opacity:.72}
.ds-jbuild .part.missing .name{opacity:.8}
.ds-jicons{margin:2px 0 6px}
.ds-jicons .ds-ico{width:32px;height:32px}
html.ds-touch .ds-itemcard{font-size:.86em}
html.ds-touch .ds-itemcard .row:nth-child(n+5){display:none}
html.ds-touch .ds-itemcard .head .sub{display:none}
html.ds-touch .ds-itemcard .row{padding:.3em .7em}
`;

let styled = false;
function style(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'ds-hud-items';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** One badge. */
export function iconEl(icon: HudIcon | string, cls = ''): HTMLImageElement {
  style();
  const i = typeof icon === 'string' ? { src: icon } : icon;
  const img = el('img', `ds-ico${i.dim ? ' dim' : ''}${cls ? ` ${cls}` : ''}`);
  img.src = i.src;
  img.alt = i.label ?? '';
  img.decoding = 'async';
  img.draggable = false;
  return img;
}

/** A row of badges, kept in step with `icons` (rebuilt only when something in it changed). */
export class IconStrip {
  readonly root: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement, before: Node | null = null) {
    style();
    this.root = el('div', 'ds-icons');
    parent.insertBefore(this.root, before);
    this.root.hidden = true;
  }

  set(icons: readonly HudIcon[] | undefined): void {
    const list = icons ?? [];
    const key = list.map((i) => `${i.src}${i.dim ? '-' : '+'}`).join('|');
    if (key === this.key) return;
    this.key = key;
    this.root.replaceChildren(...list.map((i) => iconEl(i)));
    setHidden(this.root, list.length === 0);
  }
}

/** One thing being built, for the journal: its line, and each part (lit where found, dim with where it is in words). */
export interface JournalBuild {
  head: string;
  parts: { src: string; name: string; found: boolean; where: string }[];
}

/** The journal's building page: each thing a line, then a row of its parts' pictures, each with its name under it. */
export function journalBuilds(list: readonly JournalBuild[]): HTMLElement {
  style();
  const root = el('div', 'ds-jbuild');
  for (const b of list) {
    el('div', 'head', root, b.head);
    if (!b.parts.length) continue;
    const row = el('div', 'parts', root);
    for (const p of b.parts) {
      const cell = el('div', `part${p.found ? '' : ' missing'}`, row);
      cell.appendChild(iconEl({ src: p.src, dim: !p.found, label: p.name }));
      el('div', 'name', cell, p.name);
      el('div', 'where', cell, p.found ? 'found' : p.where);
    }
  }
  return root;
}

/** A row of pictures for the journal (the ornaments: lit where found). */
export function journalIcons(icons: readonly HudIcon[]): HTMLElement {
  style();
  const row = el('div', 'ds-icons ds-jicons');
  for (const i of icons) row.appendChild(iconEl(i));
  return row;
}

/** The workbench card (right-hand column). Hidden while the state has none. */
export class ItemCardView {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly rows: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement, before: Node | null = null) {
    style();
    this.root = el('div', 'ds-itemcard ds-panel ds-brk');
    parent.insertBefore(this.root, before);
    this.root.hidden = true;
    const head = el('div', 'head', this.root);
    this.title = el('span', '', head);
    this.sub = el('span', 'sub', head);
    this.rows = el('div', 'rows', this.root);
  }

  update(card: ItemCard | null | undefined): void {
    const key = card ? JSON.stringify(card) : '';
    if (key === this.key) return;
    this.key = key;
    setHidden(this.root, !card);
    if (!card) return;
    this.title.textContent = card.title;
    this.sub.textContent = card.sub ?? '';
    this.rows.replaceChildren(
      ...card.rows.map((r) => {
        const row = el('div', `row${r.ready ? ' ready' : ''}`);
        el('span', 'name', row, r.name);
        el('span', 'note', row, r.note);
        const strip = el('div', 'ds-icons', row);
        for (const i of r.icons) strip.appendChild(iconEl(i));
        return row;
      }),
    );
  }
}
