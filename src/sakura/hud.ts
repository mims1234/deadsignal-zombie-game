/**
 * The Sakura District's own HUD pieces: the card (the festival scroll, a charm found, an infected met for the first
 * time, a chapter) and the field file in the pause menu.
 */
import { FIELD, type FieldKind, OUTBREAK } from './campaign';
import type { SakuraNote } from './lore';

/** The sakura stamp: a five-petalled blossom in a red seal. */
export const STAMP_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="-50 -50 100 100"><rect x="-46" y="-46" width="92" height="92" rx="10" fill="none" stroke="#c8243a" stroke-width="6"/>${[0, 72, 144, 216, 288]
      .map((a) => `<ellipse cx="0" cy="-18" rx="11" ry="17" fill="#e83a5a" transform="rotate(${a})"/>`)
      .join('')}<circle r="7" fill="#ffd0d8"/></svg>`,
  );

const CSS = `
.ds-snote{position:absolute;left:24px;top:22%;max-width:400px;text-transform:none;letter-spacing:0;padding:14px 16px 10px;background:linear-gradient(180deg,rgba(40,20,32,.95),rgba(22,12,20,.95));border:1px solid rgba(255,150,190,.45);color:#f4e2ea;font-family:'Courier New',ui-monospace,monospace;font-size:13px;line-height:1.45;box-shadow:0 10px 32px rgba(0,0,0,.6),0 0 24px rgba(255,120,170,.1) inset;transform:translateX(-12px);opacity:0;transition:opacity .5s,transform .5s;pointer-events:none;z-index:4}
.ds-snote[data-show="1"]{opacity:1;transform:none}
.ds-snote h4{margin:0 0 3px;font-family:var(--ds-font-label);font-weight:700;font-size:14px;letter-spacing:.12em;color:#ff9ec8}
.ds-snote .tag{font-family:var(--ds-font-label);font-weight:700;font-size:10px;letter-spacing:.16em;color:#ff6a9a;margin-bottom:4px}
.ds-snote .src{font-size:11px;color:#c99aae;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,150,190,.25)}
.ds-snote p{margin:0 0 7px;white-space:pre-line}
.ds-snote p b{font-family:var(--ds-font-label);font-size:10px;letter-spacing:.14em;color:#ff9ec8;margin-right:6px}
.ds-snote .clue{display:flex;gap:9px;align-items:flex-start;margin-top:8px;padding-top:7px;border-top:1px dashed rgba(255,110,150,.4);color:#ffd2de}
.ds-snote .clue i{flex:0 0 26px;height:26px;background-size:contain;background-repeat:no-repeat}
@media (max-width:820px),(max-height:480px){.ds-snote{left:50%;width:min(360px,64vw);max-width:none;top:18%;font-size:11px;line-height:1.35;padding:8px 10px 4px;transform:translate(-50%,-8px)}.ds-snote[data-show="1"]{transform:translate(-50%,0)}.ds-snote p{margin:0 0 4px}}
@media (max-height:480px){.ds-snote{top:14%;max-height:68%;overflow:hidden}}
.ds-journal{text-transform:none;letter-spacing:0;display:flex;flex-direction:column;gap:10px;max-height:52vh;overflow:auto;padding-right:4px;text-align:left}
.ds-journal .jhead{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--ds-font-label);letter-spacing:.12em;font-size:12px;color:#ff9ec8}
.ds-journal .jzone{font-family:var(--ds-font-label);font-size:11px;letter-spacing:.16em;color:#c99aae;margin-top:6px}
.ds-journal details{border:1px solid rgba(255,150,190,.22);background:rgba(40,20,32,.5);padding:6px 9px}
.ds-journal summary{cursor:pointer;font-family:var(--ds-font-label);font-size:12px;letter-spacing:.08em;color:#f4e2ea;list-style:none;display:flex;gap:8px;align-items:center}
.ds-journal summary i{width:14px;height:14px;background-size:contain;background-repeat:no-repeat}
.ds-journal .unk{opacity:.45;font-family:var(--ds-font-label);font-size:12px;letter-spacing:.08em;padding:6px 9px;border:1px dashed rgba(255,150,190,.18)}
.ds-journal .jb{font-family:'Courier New',ui-monospace,monospace;font-size:12px;line-height:1.45;color:#e8d4dc;margin-top:6px}
.ds-journal .jb p{margin:0 0 6px}
.ds-journal .jb p b{font-family:var(--ds-font-label);font-size:10px;letter-spacing:.14em;color:#ff9ec8;margin-right:6px}
.ds-journal .egg{border:1px solid rgba(255,90,130,.45);padding:8px 10px;color:#ffd2de;font-size:12px}
`;

function css(): void {
  if (typeof document === 'undefined' || document.getElementById('ds-sakura-css')) return;
  const style = document.createElement('style');
  style.id = 'ds-sakura-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function para(parent: HTMLElement, label: string, text: string): void {
  const p = document.createElement('p');
  const b = document.createElement('b');
  b.textContent = label;
  p.append(b, text);
  parent.appendChild(p);
}

/** A note's text as shown: the poem on the stage is this run's (the quest writes it). */
export interface NoteText {
  was: string;
  during: string;
  now: string;
  clue?: string;
}

export class SakuraHud {
  private note: HTMLElement | null = null;
  private left = 0;

  private ensure(): boolean {
    if (this.note) return this.note.isConnected;
    if (typeof document === 'undefined') return false;
    const hud = document.querySelector('.ds-hud');
    if (!hud) return false;
    css();
    const note = document.createElement('div');
    note.className = 'ds-snote';
    note.setAttribute('role', 'note');
    hud.appendChild(note);
    this.note = note;
    return true;
  }

  /** Show a note for `seconds`. */
  show(n: SakuraNote, text: NoteText, tag: string, seconds = 16): void {
    if (!this.ensure()) return;
    const el = this.note!;
    el.replaceChildren();
    const t = document.createElement('div');
    t.className = 'tag';
    t.textContent = tag;
    const h = document.createElement('h4');
    h.textContent = n.title;
    const src = document.createElement('div');
    src.className = 'src';
    src.textContent = n.source;
    el.append(t, h, src);
    para(el, 'BEFORE', text.was);
    para(el, 'THE FALL', text.during);
    para(el, 'NOW', text.now);
    if (text.clue) {
      const c = document.createElement('div');
      c.className = 'clue';
      const i = document.createElement('i');
      i.style.backgroundImage = `url("${STAMP_URL}")`;
      const s = document.createElement('span');
      s.textContent = text.clue;
      c.append(i, s);
      el.appendChild(c);
    }
    el.dataset.show = '1';
    this.left = seconds;
  }

  /** A short card of its own (the poem, a charm found). */
  card(tag: string, title: string, body: string, seconds = 10): void {
    if (!this.ensure()) return;
    const el = this.note!;
    el.replaceChildren();
    const t = document.createElement('div');
    t.className = 'tag';
    t.textContent = tag;
    const h = document.createElement('h4');
    h.textContent = title;
    el.append(t, h);
    for (const line of body.split('\n\n')) {
      const p = document.createElement('p');
      p.textContent = line;
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

/** The field file's story section: KAIKA's chapters on a campaign run, the Thousand Lanterns otherwise. */
export interface FieldFileStory {
  chapters: { title: string; place: string; goal: string; state: 'done' | 'now' | 'todo' }[] | null;
  lanterns: { done: boolean; status: string };
}

/**
 * The field file (the pause menu): how the outbreak began, the story so far, every kind of infected met (its look, what
 * it does, why it is here; the rest as blanks), and the festival poem once it has been read.
 */
export function buildFieldFile(o: { story: FieldFileStory; seen: ReadonlySet<string>; poem: string[] | null }): HTMLElement {
  css();
  const root = document.createElement('div');
  root.className = 'ds-journal';
  const head = document.createElement('div');
  head.className = 'jhead';
  const a = document.createElement('span');
  a.textContent = 'SAKURAGI FIELD FILE';
  const kinds = Object.keys(FIELD) as FieldKind[];
  const b = document.createElement('span');
  b.textContent = `${kinds.filter((k) => o.seen.has(k)).length} / ${kinds.length} INFECTED`;
  head.append(a, b);
  root.appendChild(head);
  const section = (t: string): void => {
    const z = document.createElement('div');
    z.className = 'jzone';
    z.textContent = t;
    root.appendChild(z);
  };
  const entry = (title: string, fill: (body: HTMLElement) => void, open = false, stamp = false): void => {
    const d = document.createElement('details');
    d.open = open;
    const s = document.createElement('summary');
    if (stamp) {
      const i = document.createElement('i');
      i.style.backgroundImage = `url("${STAMP_URL}")`;
      s.appendChild(i);
    }
    s.append(title);
    const body = document.createElement('div');
    body.className = 'jb';
    fill(body);
    d.append(s, body);
    root.appendChild(d);
  };
  // the story so far
  section('THE STORY');
  if (o.story.chapters) {
    o.story.chapters.forEach((c, i) => {
      if (c.state === 'todo') {
        const u = document.createElement('div');
        u.className = 'unk';
        u.textContent = `${i + 1}.  ${c.title}`;
        root.appendChild(u);
        return;
      }
      entry(`${i + 1}.  ${c.title}${c.state === 'done' ? '   ✓' : '   (now)'}`, (body) => para(body, c.place, c.goal), c.state === 'now');
    });
  }
  const eg = document.createElement('div');
  eg.className = 'egg';
  eg.textContent = o.story.lanterns.done ? 'THE THOUSAND LANTERNS: the dead of Sakuragi were seen home. Every story mission is open.' : o.story.lanterns.status;
  root.appendChild(eg);
  if (o.poem) entry('The festival scroll', (body) => para(body, '桜', o.poem!.join('\n')), false, true);
  // how it began
  section('THE OUTBREAK');
  for (const p of OUTBREAK) entry(p.title, (body) => {
    const q = document.createElement('p');
    q.textContent = p.text;
    body.appendChild(q);
  });
  // the infected
  section('THE INFECTED');
  for (const k of kinds) {
    const f = FIELD[k];
    if (!o.seen.has(k)) {
      const u = document.createElement('div');
      u.className = 'unk';
      u.textContent = '? ? ?   (not yet met)';
      root.appendChild(u);
      continue;
    }
    entry(`${f.name}  -  ${f.tag}`, (body) => {
      para(body, 'LOOK', f.look);
      para(body, 'WHAT IT DOES', f.does);
      para(body, 'WHY HERE', f.why);
    });
  }
  return root;
}
