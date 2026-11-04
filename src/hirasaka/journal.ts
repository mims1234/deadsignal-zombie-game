/**
 * HIRASAKA's journal (the pause menu's JOURNAL tab): what the island is (the story so far, told as the run goes),
 * Genzō's tapes as heard, the photographs as found, and the field notes on what lives here now. Kept between runs in
 * this browser: a tape heard once stays in the journal.
 */
import { LINE } from './lines';
import { PHOTOS, TAPES } from './places';
import { ACT, HirasakaStory, JOB_IDS, JOB_NAMES, type StoryView } from './story';

export const PHOTO_TEXT: readonly { year: string; text: string }[] = [
  { year: '1966', text: 'The ferry Kaimaru at the pier. A boy waving from the bow, gap-toothed, nine years old. On the back: "Daigo Sakuma, first trip out."' },
  { year: '1971', text: 'The Obon dance on the school roof, lanterns strung from the yagura. Genzō, in a borrowed yukata, cannot dance. Mio is laughing at him.' },
  { year: '1972', text: 'Mio on the roof of Block 65 with a baby in her arms, the sea behind her. On the back, in her hand: "Natsuko. Our summer."' },
  { year: 'undated', text: 'A family of the old village under the sea, in clothes nobody has worn for three hundred years. They are smiling. They are standing in front of the tree of white peaches.' },
  { year: '1974', text: 'The night shift\'s supper rota, pinned to a pit prop. In Mio\'s handwriting against 13 August: "My turn. Bring the peaches."' },
];

/** The story so far, a page for each act (and the ending). */
const ACT_TEXT: readonly string[] = [
  'Hirasaka-jima: a coal island, five thousand people stacked on a rock in the sea, emptied in a week in 1974 after "a gas accident in Shaft Three". Three nights ago Typhoon No. 13 cracked its seawall, its lights came on by themselves, and the dead began coming over the water. Natsuki Hirata has come home to the island her grandfather never stopped talking about. The cage down to Shaft Three needs his key, the lighthouse and the sea gates.',
  'Under the sea the night shift is still working. Below the seam there is a village older than the island, its doors open, its tree of white peaches still bearing. Somewhere past it, in the Root Hall, is what Genzō left behind.',
  'Kurogane is dead and the cable has gone. The only way out is the Slope, up to the old adit at the foot of the island - and up the island, with the storm surge rising behind. She is following. Do not look back. At the summit, stand in the ring beside the Sealing Stone until it rolls home.',
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
  { kind: 'drowned', name: 'The Drowned', text: 'Islanders the typhoon took off the seawall. They lie on the wet concrete like the dead until you come close. Then they get up.' },
  { kind: 'miner', name: 'Miners', text: 'The night shift, still working the seam. Half deaf to anything but a sprint or a shot. Walk past quietly.' },
  { kind: 'lampeater', name: 'Lamp-eaters', text: 'White as roots, black-eyed, a cold light in the mouth. They go for your light: a hit puts your lamp out for a few seconds.' },
  { kind: 'slag', name: 'Slag', text: 'A miner the fire got into. Crusted black, burning in the cracks, slow and heavy, and it hits like a falling prop.' },
  { kind: 'overseer', name: 'Kurogane', text: 'Tetsuji Kurogane, the overseer. Bitten a week before the collapse; he hid it under his gloves and kept the seam open. He still gives orders, and the miners still come.' },
  { kind: 'hag', name: 'Hags of the Slope', text: 'They crawl up the slope on all fours behind anyone climbing it, and they always know where you are. They whisper the same thing.' },
  { kind: 'follower', name: 'Mio', text: 'She follows you up. Nothing you carry hurts her, but enough shots push her back a step. Every time you look back, she is closer. A peach holds her off for a moment; while she leans on the stone it barely moves.' },
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
  const tapes = p.tapes | v.tapes;
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
  const met = FIELD.filter((f) => seen.has(f.kind));
  if (met.length) {
    h('FIELD NOTES');
    for (const f of met) para(`${f.name}: ${f.text}`);
  }
  if (p.home) para('HOME: you turned round at the summit and let her see you. The island lights came on, every one.', 'egg');
  else if (p.sealed) para('SEALED: the stone is home and the slope is shut. Natsuki has his tapes. Some things on the island were never told.', 'lock');
  return root;
}
