/**
 * HIRASAKA's journal (the pause menu's JOURNAL tab): what the island is (the story so far, told as the run goes),
 * Genzō's tapes as heard, the photographs as found, and the field notes on what lives here now. Kept between runs in
 * this browser: a tape heard once stays in the journal.
 */
import { LINE } from './lines';
import { PHOTOS, TAPES } from './places';
import { sideJournal } from './sides'; // (sides)
import { ACT, HirasakaStory, JOB_IDS, JOB_NAMES, type StoryView } from './story';

export const PHOTO_TEXT: readonly { year: string; text: string }[] = [
  { year: '1966', text: `The ferry at the pier on a calm day, the whole deck waving. On the back: "First boat of the summer."` },
  { year: '1968', text: `A girl on a balcony over Block 30's light well, laughing at whoever holds the camera. On the back, in a man's hand: "Mio, who would not stand still."` },
  { year: '1971', text: `The Obon dance on the school roof, lanterns strung from the yagura. Genzō in a borrowed yukata, who cannot dance. Mio is pulling him in.` },
  { year: '1973', text: `The manager's garden on the summit, the island's only trees. A row of men in Company caps; Kurogane at the end, gloves on, not smiling.` },
  { year: '1974', text: `The night shift's supper rota, pinned to a pit prop. Against the Obon date, in Mio's handwriting: "My turn. Rice for forty."` },
];

/** The story so far, a page for each act. */
const ACT_TEXT: readonly string[] = [
  `Hirasaka-jima: a coal island, five thousand people stacked on a rock in the sea, emptied in 1974 after "a gas accident in Shaft Three". The survey came out with Daigo to record the blocks before they fall. Tonight the typhoon tore his ferry off the pier, and at two in the morning the cage bell rang from 636 metres down. Nobody can leave until the storm passes. The winding engine needs steam from the boiler under Block 31, air from the fan above the Stairs of Life, and Genzō's cage key from his room at the top of Block 65.`,
  `Under the sea the night shift is still working. The funayūrei hold the flooded gallery; past the coal face lies a village older than the island, its lanterns lit for Obon and its hearth still warm. Below it, down a passage of stacked stone, is the Root Hall, and what Genzō left in its roots.`,
  `Kurogane is dead and the cage cable has gone. The only way out is the slope: up the stone passage, out of the old adit, up the Stairs of Life and the Hell Stairs, with the sea rising behind every place you pass. She is following. Do not look back. At the top, haul the stone across with the chain winches.`,
];

const KEY = 'deadsignal.hirasaka.v1';

export interface HirasakaProgress {
  /** Bits: tapes ever heard; photographs ever found. */
  tapes: number;
  photos: number;
  /** Mio's message heard at least once. */
  call: boolean;
  /** The endings seen: sealed, home. */
  sealed: boolean;
  home: boolean;
}

export function loadHirasaka(): HirasakaProgress {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<HirasakaProgress> | null;
    return { tapes: Number(raw?.tapes) & 31, photos: Number(raw?.photos) & 31, call: raw?.call === true, sealed: raw?.sealed === true, home: raw?.home === true };
  } catch {
    return { tapes: 0, photos: 0, call: false, sealed: false, home: false };
  }
}

export function saveHirasaka(p: HirasakaProgress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** The field notes: what lives on the island now (shown once each kind has been met, `seen`). */
export const FIELD: readonly { kind: string; name: string; text: string }[] = [
  { kind: 'resident', name: 'Islanders', text: 'The island as the last week left it: sailor collars, aprons, grey faces. They walk the lanes they lived on.' },
  { kind: 'drowned', name: 'The Drowned', text: 'Islanders the sea took off the wall. On the island they come up out of the water; below, the funayūrei stand in the flooded gallery with their hands out for a ladle.' },
  { kind: 'miner', name: 'Miners', text: 'The night shift, still working the seam. Half deaf to anything but a sprint or a shot. Walk past quietly.' },
  { kind: 'lampeater', name: 'Lamp-eaters', text: 'White as roots, black-eyed, a cold light in the mouth. They go for your light: a hit puts your lamp out for a few seconds.' },
  { kind: 'slag', name: 'Slag', text: 'A miner the fire got into. Crusted black, burning in the cracks, slow and heavy, and it hits like a falling prop.' },
  { kind: 'overseer', name: 'Kurogane', text: 'The overseer who shut the cage on forty men in 1974 and called it gas. He carries eight thunders on his body and still gives orders; the miners still come.' },
  { kind: 'hag', name: 'Hags of the Slope', text: 'They crawl up behind anyone climbing out, and they always know where you are; faster after a hand that ate at the hearth. They stop for grapes and will not pass the comb’s bamboo.' },
  { kind: 'follower', name: 'Mio', text: 'She follows you up. Nothing you carry hurts her, but enough shots push her back a step. Every time you look back, she is closer. A peach holds her off for a moment; while she leans on the rock it barely moves.' },
];

const CSS = `
.hs-journal{display:flex;flex-direction:column;gap:12px;max-height:60vh;overflow:auto;padding-right:6px;font-size:14px;line-height:1.5}
.hs-journal h4{margin:6px 0 0;letter-spacing:.12em;font-size:12px;opacity:.7}
.hs-journal .tape{border-left:2px solid #ffb04a;padding:2px 0 2px 10px}
.hs-journal .photo{border-left:2px solid #c8d8ff;padding:2px 0 2px 10px}
.hs-journal .tape b,.hs-journal .photo b{font-family:ui-monospace,monospace;color:#ffd08a;margin-right:8px}
.hs-journal .lock{opacity:.45;font-style:italic}
.hs-journal ul{margin:0;padding-left:18px}
.hs-journal .egg{color:#ffd88a}
.hs-journal .side{border-left:2px solid #9fd8b0;padding:2px 0 2px 10px}
.hs-journal .side b{display:block;font-size:12px;letter-spacing:.08em;color:#bfe8c8}
.hs-journal .page{font-style:italic;opacity:.85;margin-top:4px}
.hs-journal .act{opacity:.92}
`;

/** The journal page (pause menu). `seen`: the kinds met this run. */
export function buildJournal(p: HirasakaProgress, v: StoryView, seen: ReadonlySet<string>): HTMLElement {
  const root = document.createElement('div');
  root.className = 'hs-journal';
  const st = document.createElement('style');
  st.textContent = CSS;
  root.appendChild(st);
  const h = (t: string): void => {
    const e = document.createElement('h4');
    e.textContent = t;
    root.appendChild(e);
  };
  const para = (t: string, cls = ''): void => {
    const e = document.createElement('div');
    e.className = cls;
    e.textContent = t;
    root.appendChild(e);
  };
  const act = Math.min(2, v.act === ACT.won ? 2 : v.act);
  h(['ACT I  -  THE ISLAND', 'ACT II  -  THE DEEP', 'ACT III  -  THE CLIMB'][act]!);
  para(ACT_TEXT[act]!, 'act');
  if (v.act === ACT.island) {
    const jobs = document.createElement('ul');
    for (const id of JOB_IDS) {
      const li = document.createElement('li');
      li.textContent = `${HirasakaStory.isDone(v, id) ? 'DONE' : '....'}  ${JOB_NAMES[id]}`;
      jobs.appendChild(li);
    }
    root.appendChild(jobs);
  }
  const tapes = (p.tapes | v.tapes) & 31;
  h(`GENZŌ'S TAPES  (${HirasakaStory.count(tapes)} OF ${TAPES.length})`);
  TAPES.forEach((t, i) => {
    const d = document.createElement('div');
    if (tapes & (1 << i)) {
      d.className = 'tape';
      const b = document.createElement('b');
      b.textContent = `TAPE ${i + 1}`;
      d.append(b, document.createTextNode(LINE[`tape_${i + 1}`]?.text ?? ''));
    } else {
      d.className = 'tape lock';
      d.textContent = `A tape not found yet: ${t.where}.`;
    }
    root.appendChild(d);
  });
  const photos = p.photos | v.photos;
  h(`PHOTOGRAPHS  (${HirasakaStory.count(photos)} OF ${PHOTOS.length})`);
  PHOTOS.forEach((ph, i) => {
    const d = document.createElement('div');
    if (photos & (1 << i)) {
      d.className = 'photo';
      const b = document.createElement('b');
      b.textContent = PHOTO_TEXT[i]!.year;
      d.append(b, document.createTextNode(PHOTO_TEXT[i]!.text));
    } else {
      d.className = 'photo lock';
      d.textContent = `A photograph not found yet: ${ph.where}.`;
    }
    root.appendChild(d);
  });
  if (p.call || v.call) {
    h('THE GALLERY TELEPHONE');
    para(LINE.mio_call?.text ?? '', 'tape');
  } else if (HirasakaStory.count(v.photos) >= PHOTOS.length) para('Every photograph is found. Somewhere in the galleries, a telephone is ringing.', 'egg');
  // (sides) the side stories found, each its own part: what was learned, the page it gave, the island's history
  const sides = sideJournal(v.sides ?? []);
  if (sides.length) {
    h(`SIDE STORIES  (${sides.filter((q) => q.head.endsWith('DONE')).length} OF 10)`);
    for (const q of sides) {
      const d = document.createElement('div');
      d.className = 'side';
      const b = document.createElement('b');
      b.textContent = q.head;
      d.appendChild(b);
      for (const r of q.rows) d.appendChild(Object.assign(document.createElement('div'), { textContent: r }));
      if (q.page) d.appendChild(Object.assign(document.createElement('div'), { className: 'page', textContent: q.page }));
      root.appendChild(d);
    }
  }
  const met = FIELD.filter((f) => seen.has(f.kind));
  if (met.length) {
    h('FIELD NOTES');
    for (const f of met) para(`${f.name}: ${f.text}`);
  }
  if (p.home) para('HOME: you turned round at the rock and let her see you, and she walked out with you. In the morning the spirit boats went out for the named dead.', 'egg');
  else if (p.sealed) para('SEALED: the rock is home and the slope is shut. Daigo has his grandfather’s last tape. Some things on the island were never told.', 'lock');
  return root;
}
