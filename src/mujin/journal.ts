/**
 * MUJIN's journal (the pause menu's JOURNAL tab): Ren's thread, posted from the waiting room on the first night until
 * her battery died, found a post at a time (one for each right read, and each call answered), and what the station has
 * been seen to change. Kept between runs in this browser.
 */
import { ANOMALIES } from './anomalies';

export const REN_POSTS: readonly { time: string; text: string }[] = [
  { time: '23:58', text: 'fell asleep on the last train out of the city. woke up and the train was gone. the sign on the platform says むじん. it is not on any map on my phone.' },
  { time: '00:12', text: 'there is a man in a station cap walking the platform with a lamp. i asked him when the next train is. he said "at dawn". he did not look at me.' },
  { time: '00:40', text: 'the people on the platform do not move. they just wait. one of them is holding a ticket for a train that does not exist.' },
  { time: '01:15', text: 'the clock over the gates said 4:57 when i got here. it still says 4:57. my phone says 1:15.' },
  { time: '01:52', text: 'i went to the shop street to find water. when i came back the station was the same but something was different and i cannot say what.' },
  { time: '02:30', text: 'there is a woman in the field behind the fence. she is very tall. she makes a sound like po po po. do not let her hear you run.' },
  { time: '03:01', text: 'i think it starts again. every time the bell rings the night goes back to the start. the man with the lamp says the station must be in order.' },
  { time: '03:33', text: 'figured it out. each time round one thing is wrong. if you find it he lets one lamp stay lit. if you get it wrong they all go out.' },
  { time: '04:04', text: 'there was a white thing wriggling in the grass. i looked at it too long and the whole world went soft. i nearly walked onto the tracks.' },
  { time: '04:20', text: 'someone sat next to me on the bench and whispered "the clock". the clock was running backwards. i did not look at who it was.' },
  { time: '04:41', text: 'there is a payphone in the hall that rings. if anyone else is here, answer it. i will keep calling.' },
  { time: '04:50', text: 'battery 4%. the lamps keep going out. i keep getting it wrong. i am so tired.' },
  { time: '04:55', text: 'the stationmaster told me the tunnel fell in on the last train, a long time ago. he said everyone on it is still waiting. he said i am waiting too.' },
  { time: '04:56', text: 'i do not think i am on the platform anymore. people walk right past me. if you can see me, take my hand. please.' },
  { time: '04:57', text: 'if this posts: the station has a name. i saw it from the window of the morning train.' },
];

const KEY = 'deadsignal.mujin.v1';

export interface MujinProgress {
  /** How many of Ren's posts have been found (they come in order). */
  posts: number;
  /** The changes ever put right (ids). */
  found: string[];
  /** The Passenger: Ren brought home at least once. */
  egg: boolean;
}

export function loadMujin(): MujinProgress {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<MujinProgress> | null;
    return { posts: Math.max(0, Math.min(REN_POSTS.length, Number(raw?.posts) || 0)), found: Array.isArray(raw?.found) ? raw.found.filter((s): s is string => typeof s === 'string') : [], egg: raw?.egg === true };
  } catch {
    return { posts: 0, found: [], egg: false };
  }
}

export function saveMujin(p: MujinProgress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const CSS = `
.mj-journal{display:flex;flex-direction:column;gap:14px;max-height:60vh;overflow:auto;padding-right:6px;font-size:14px;line-height:1.5}
.mj-journal h4{margin:0;letter-spacing:.12em;font-size:12px;opacity:.7}
.mj-journal .post{border-left:2px solid #6a8cff;padding:2px 0 2px 10px}
.mj-journal .post b{font-family:ui-monospace,monospace;color:#9ab4ff;margin-right:8px}
.mj-journal .lock{opacity:.45;font-style:italic}
.mj-journal ul{margin:0;padding-left:18px}
.mj-journal .egg{color:#ffd88a}
`;

/** The journal page (pause menu). */
export function buildJournal(p: MujinProgress, run: { loop: number; lamps: number; rights: number; wrongs: number }): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mj-journal';
  const st = document.createElement('style');
  st.textContent = CSS;
  root.appendChild(st);
  const h = (t: string): void => {
    const e = document.createElement('h4');
    e.textContent = t;
    root.appendChild(e);
  };
  h(`THIS NIGHT  -  LOOP ${run.loop}  -  ${run.lamps} OF 5 LAMPS  -  ${run.rights} RIGHT, ${run.wrongs} WRONG`);
  h(`REN'S THREAD  (${p.posts} OF ${REN_POSTS.length})`);
  REN_POSTS.forEach((post, i) => {
    const d = document.createElement('div');
    d.className = i < p.posts ? 'post' : 'post lock';
    if (i < p.posts) {
      const b = document.createElement('b');
      b.textContent = post.time;
      d.append(b, document.createTextNode(post.text));
    } else d.textContent = 'A post you have not found yet. Read the station right, or answer the phone.';
    root.appendChild(d);
  });
  h(`WHAT THE STATION CHANGED  (${p.found.length} OF ${ANOMALIES.length} FOUND)`);
  const ul = document.createElement('ul');
  for (const a of ANOMALIES) {
    if (!p.found.includes(a.id)) continue;
    const li = document.createElement('li');
    li.textContent = a.was;
    ul.appendChild(li);
  }
  if (ul.children.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nothing yet.';
    ul.appendChild(li);
  }
  root.appendChild(ul);
  if (p.egg) {
    const e = document.createElement('div');
    e.className = 'egg';
    e.textContent = 'THE PASSENGER: you brought Ren home. The station has a name now.';
    root.appendChild(e);
  }
  return root;
}
