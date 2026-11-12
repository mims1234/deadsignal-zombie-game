/**
 * ZARYA: the people. Everyone who speaks, and everyone the lines name, as someone the player knows and can feel for.
 *
 *   - Every caption says who is speaking by name, in that person's own colour, with their portrait beside it. ZARYA
 *     takes every line said on its wire (`Game.radioHook`) and hands the HUD a face with it (`ui/hudFx.ts`); a line
 *     from someone not in this file (the Mazoku cards' COMMAND) is shown as it is on every other map.
 *   - The first time someone speaks, a short card in the left-hand corner introduces them: portrait, name, who they
 *     are in a line.
 *   - The journal's PEOPLE page (`page`) lists everyone met so far, with a few lines about each that grow as the story
 *     tells more. Someone is met when they speak or when a line names them; each line about them is learned when the
 *     line that tells it is said (`Fact.on` is matched against what is said, so the page only ever knows what the
 *     player has heard).
 *   - The sleepers the story names (Lida, the Sorokins, Vera's grandmother, Danya, Zina in her cab, Nina and Kostya in
 *     the shelter) wear a small faint name over their heads when the player is close, once they have been named. The
 *     named infected carry the director's own plate.
 *
 * Portraits: `public/zarya/people/<id>.webp`, painted by `scripts/zarya-people-art.mjs`. Nothing here is saved: a run
 * starts knowing nobody.
 */
import * as THREE from 'three';
import type { RadioFace } from '../ui/hudTypes';
import type { Speaker } from './lines';
import { KIOSKS, people as townsfolk } from './places';
import type { Person } from './types';

export type PersonId =
  | 'mira'
  | 'timur'
  | 'vera'
  | 'nina'
  | 'kostya'
  | 'zina'
  | 'zimin'
  | 'danya'
  | 'babushka'
  | 'gena'
  | 'lida'
  | 'sorokins'
  | 'oleg'
  | 'borya'
  | 'lyudmila'
  | 'vitya';

/** Something known about someone: from the start (`on` left out), or once a line matching `on` has been said. */
export interface Fact {
  readonly on?: RegExp;
  readonly text: string;
}

export interface PersonDef {
  readonly id: PersonId;
  /** The speaker id in `lines.ts`, for those who speak. */
  readonly speaker?: Speaker;
  /** As the caption, the card and the page name them. */
  readonly name: string;
  /** As the phone's one top line names them. */
  readonly short: string;
  /** Their own colour: the caption's name and the portrait's ring. */
  readonly color: string;
  /** Who they are, in one line: the first-meeting card, and under the name on the page. */
  readonly who: string;
  /** A line said that names them (the speakers are met when they first speak, whether or not this is set). */
  readonly met?: RegExp;
  readonly facts: readonly Fact[];
}

export const PEOPLE: readonly PersonDef[] = [
  {
    id: 'mira',
    speaker: 'MIRA',
    name: 'MIRA',
    short: 'MIRA',
    color: '#62d2ff',
    who: 'You. Volunteer search squad, out tonight for a lost boy.',
    facts: [
      { text: 'Out tonight with Timur and Vera, for Kostya, seven, missing in the Univermag.' },
      { on: /Danya took one of these/, text: 'Her brother Danya took a paid sleep study at the Institute two winters ago. Her mother was told he had left for the mainland.' },
      { on: /Don't count them/, text: 'Knows Timur counts things when he is frightened, and tells him not to.' },
      { on: /He did it to nine thousand people/, text: 'Will not forgive a choice made for nine thousand people without asking one of them.' },
      { on: /still wearing my scarf/, text: 'Found Danya under the Institute, asleep, not a day older, still wearing her scarf.' },
    ],
  },
  {
    id: 'timur',
    speaker: 'TIMUR',
    name: 'TIMUR',
    short: 'TIMUR',
    color: '#ffa04f',
    who: 'Search squad. The town handyman: fixes anything, charges for most of it.',
    facts: [
      { text: 'Grew up in Zarya-12, and knows how every part of it works.' },
      { on: /It was science/, text: 'Pulled Ded Moroz\'s beard when he was five, to check. It was science.' },
      { on: /Every clock in town runs off one master clock/, text: 'Knew that every clock in town runs off one master clock, up at the Institute.' },
      { on: /\.\.\.Thirty-one\./, text: 'Counts things when he is frightened.' },
      { on: /Every January I put the spare back/, text: 'Every December he lends the tram stop\'s spare fuse to the town tree, and every January he puts it back.' },
      { on: /Row three, number forty/, text: 'Garage forty, row three, is his: a kettle on the left, and a motorcycle nobody touches.' },
      { on: /I fixed that revolve in October/, text: 'Fixed the theatre\'s revolving stage in October.' },
    ],
  },
  {
    id: 'vera',
    speaker: 'VERA',
    name: 'VERA',
    short: 'VERA',
    color: '#82e28c',
    who: 'Search squad. Kneels by every sleeper to be sure they breathe.',
    facts: [
      { text: 'Search squad. Her grandmother lives on Stroiteley Street, four stops down Line One, and tonight her window is open.' },
      { on: /a hundred and ninety-nine to go/, text: 'When the sleepers would not wake, she said she had a hundred and ninety-nine more to try.' },
      { on: /I've shut it\. I said I would/, text: 'Reached her grandmother and shut the window, as she promised.' },
      { on: /He did it to save them/, text: 'Read Zimin\'s notes and understood why he did it.' },
      { on: /we build over them/, text: 'Would keep watch over the sleepers until spring, if it came to that.' },
    ],
  },
  {
    id: 'nina',
    speaker: 'NINA',
    name: 'NINA PAVLOVNA',
    short: 'NINA',
    color: '#e6c78e',
    who: 'Night watchwoman of the Univermag for thirty years. Keeps the shelter door.',
    facts: [
      { text: 'Knows everyone in town by name, and most of what they owe her.' },
      { on: /Fired twice since nineteen seventy-four/, text: 'Keeps a service pistol for each shift. Fired twice since 1974, both times at the ceiling.' },
      { on: /There is a speaker in every room in this town/, text: 'Minds Kostya in the shelter and speaks to the squad over the town\'s wired speakers.' },
      { on: /First time anyone has thanked me for it/, text: 'Thirty years keeping the door. Timur was the first to thank her for it.' },
      { on: /never once saw the pageant/, text: 'Has never seen the children\'s pageant. Somebody had to mind the store.' },
      { on: /Arkady\. \.\.\.In the story/, text: 'Knew Arkady Zimin, and remembered the old tale of Morozko before anyone else did.' },
    ],
  },
  {
    id: 'kostya',
    speaker: 'KOSTYA',
    name: 'KOSTYA',
    short: 'KOSTYA',
    color: '#ff6650',
    who: 'Seven, red hat. The boy the squad came to find.',
    met: /Kostya/,
    facts: [
      { text: 'Last seen in the toy department, second floor, forty minutes before the squad came.' },
      { on: /I was guarding the door/, text: 'Was not lost. He was guarding the shelter door, because it was open and it should not have been.' },
      { on: /Ded Moroz is following the tram/, text: 'Always knows where Ded Moroz, and his sack, have gone.' },
      { on: /I was supposed to be the Hare/, text: 'Was meant to be the Hare in his class\'s pageant. Anya is the Snowflake.' },
      { on: /That's my den/, text: 'Has a den behind the toy counter. Valya on toys pretends she cannot see him.' },
      { on: /If the tree's whole at midnight/, text: 'Knows the old rule: if the tree is whole at midnight, the museum\'s cabinet is opened.' },
    ],
  },
  {
    id: 'zina',
    speaker: 'ZINA',
    name: 'TYOTYA ZINA',
    short: 'ZINA',
    color: '#9db6ff',
    who: 'Tram driver. Thirty-one years on Line One, never one day missed.',
    met: /Tyotya Zina/,
    facts: [
      { text: 'Asleep in her cab, and still on time.' },
      { on: /She takes it to tea/, text: 'Takes her controller handle to tea with her. Without it the car does not move.' },
      { on: /Opinions\./, text: 'Banned from the canteen upstairs. For opinions.' },
      { on: /Tonight's is filled in/, text: 'Tonight\'s route sheet is already filled in, every stop, in her hand.' },
    ],
  },
  {
    id: 'zimin',
    speaker: 'ZIMIN',
    name: 'ARKADY ZIMIN',
    short: 'ZIMIN',
    color: '#d4efff',
    who: 'Director of the Institute, and the town\'s Ded Moroz every year.',
    met: /Arkady Zimin/,
    facts: [
      { text: 'Has been Ded Moroz at every New Year since the first town tree, in 1987.' },
      { on: /They would have frozen by February/, text: 'Knew the heating plant would not last the winter. Asleep, he wrote, the town could wait for spring.' },
      { on: /He did it to nine thousand people/, text: 'Put nine thousand people to sleep without asking one of them.' },
      { on: /Are you warm, child\?/, text: 'Came as Morozko, the frost of the old tale, and asked whether they were warm.' },
      { on: /Then I was wrong about what people do in the cold/, text: 'Watched the squad cover the sleepers all night, and believed them.' },
      { on: /I had it put where nobody in this town could forget it/, text: 'Had the order of the keys put where nobody in town could forget it.' },
    ],
  },
  {
    id: 'danya',
    name: 'DANYA',
    short: 'DANYA',
    color: '#ffb36b',
    who: "Mira's brother.",
    met: /Danya/,
    facts: [
      { text: 'Took the Institute\'s paid sleep study two winters ago. He said it was the easiest money in town.' },
      { on: /still wearing my scarf/, text: 'Asleep under the Institute for two winters, not a day older, in Mira\'s scarf.' },
    ],
  },
  {
    id: 'babushka',
    name: "VERA'S BABUSHKA",
    short: 'BABUSHKA',
    color: '#d9a7c7',
    who: "Vera's grandmother, at her window on Stroiteley Street.",
    met: /Babushka/,
    facts: [
      { text: 'She left her window open so she could see the town tree.' },
      { on: /She had her shawl on/, text: 'Asleep at her window, breathing, with her shawl on. She always has her shawl on.' },
      { on: /She was waiting for me/, text: 'At three minutes to twelve she was looking at the tree, waiting for Vera.' },
    ],
  },
  {
    id: 'gena',
    name: 'GENA',
    short: 'GENA',
    color: '#e8a39a',
    who: 'From the meat rows at the Rynok.',
    met: /Gena/,
    facts: [
      { text: 'Nina told him to stop smoking for thirty years.' },
      { on: /That isn't Gena any more/, text: 'The first of them the squad met who was not breathing.' },
    ],
  },
  {
    id: 'lida',
    name: 'LIDA',
    short: 'LIDA',
    color: '#8fc4ff',
    who: 'From the pharmacy. Blue scarf, by the fair kiosks.',
    met: /Lida/,
    facts: [{ text: 'Asleep, and breathing. Nina asked the squad to leave her be.' }],
  },
  {
    id: 'sorokins',
    name: 'THE SOROKINS',
    short: 'SOROKINS',
    color: '#f0d27a',
    who: 'A family of five, by the ice slide.',
    met: /Sorokins/,
    facts: [{ text: 'All five asleep together. Mr Sorokin has owed Nina for a cloakroom tag since March.' }],
  },
  {
    id: 'oleg',
    name: 'OLEG PETROVICH',
    short: 'OLEG',
    color: '#c99a6b',
    who: 'PE teacher. The bear of the New Year fair.',
    met: /Oleg Petrovich/,
    facts: [
      { text: 'Has been the bear every year since Timur was at school.' },
      { on: /He guards it from children/, text: 'His job is to guard Ded Moroz\'s sack from children. Kostya says he is really good at it.' },
      { on: /An enamel sun on the tag/, text: 'He carried the Sun warden\'s key.' },
    ],
  },
  {
    id: 'borya',
    name: 'BORYA',
    short: 'BORYA',
    color: '#d58f7e',
    who: 'The Rynok\'s butcher. Sleeps at his counter in the season.',
    met: /Borya/,
    facts: [
      { text: 'The size of his own cold store.' },
      { on: /He walks in there forty times a day/, text: 'Walks into his cold store forty times a day.' },
      { on: /A cosmonaut on the tag/, text: 'He carried the Cosmonaut warden\'s key.' },
      { on: /For the bears/, text: 'His ledger: forty kilos of meat a week to the Institute, "for the bears".' },
    ],
  },
  {
    id: 'lyudmila',
    // (she says her part from the pageant in the fight: Baba Yaga's stage, `stage.ts`)
    speaker: 'YAGA',
    name: 'LYUDMILA MARKOVNA',
    short: 'LYUDMILA',
    color: '#c7a0e8',
    who: 'Baba Yaga in the children\'s pageant since before the squad was born.',
    met: /Lyudmila Markovna/,
    facts: [
      { text: 'Never comes out of the hut until it turns.' },
      { on: /^Wheat\.$/, text: 'She carried the Wheat warden\'s key.' },
    ],
  },
  {
    id: 'vitya',
    name: 'VITYA',
    short: 'VITYA',
    color: '#f2b0d0',
    who: 'From accounts. Toastmaster of the staff party.',
    met: /Vitya/,
    facts: [
      { text: 'Will not stop while there is a microphone.' },
      { on: /^A dove\.$/, text: 'He carried the Dove warden\'s key.' },
      { on: /photographing the party/, text: 'Was photographing the party with his Zenit when the clocks stopped.' },
    ],
  },
];

const BY_ID = new Map(PEOPLE.map((p) => [p.id, p]));
const BY_SPEAKER = new Map(PEOPLE.flatMap((p) => (p.speaker ? [[p.speaker as string, p] as const] : [])));

/** Where a portrait is served from. */
export const portraitUrl = (id: PersonId): string => `${import.meta.env?.BASE_URL ?? '/'}zarya/people/${id}.webp`;

/** The caption's face for a speaker id, or null for someone who is not one of ZARYA's people. */
export function faceOf(speaker: string): RadioFace | null {
  const p = BY_SPEAKER.get(speaker);
  return p ? { name: p.name, short: p.short, color: p.color, portrait: portraitUrl(p.id) } : null;
}

/** What has been learned so far: who has been met, and which of their facts are known. Pure (tests use it). */
export class Acquaintance {
  /** In the order met. */
  readonly met: PersonId[] = [];
  readonly known = new Set<string>();
  /** Those who have had their first-meeting card. */
  readonly carded = new Set<PersonId>();

  reset(): void {
    this.met.length = 0;
    this.known.clear();
    this.carded.clear();
  }

  /** A line has been said. Returns whoever should now be introduced by a card (a speaker, the first time they speak). */
  heard(speaker: string, text: string): PersonId | null {
    const by = BY_SPEAKER.get(speaker);
    if (by) this.meet(by.id);
    for (const p of PEOPLE) {
      if (p.met?.test(text)) this.meet(p.id);
      p.facts.forEach((f, i) => {
        if (f.on?.test(text)) this.known.add(`${p.id}:${i}`);
      });
    }
    if (!by || this.carded.has(by.id)) return null;
    this.carded.add(by.id);
    return by.id;
  }

  meet(id: PersonId): void {
    if (!this.met.includes(id)) this.met.push(id);
  }

  has(id: PersonId): boolean {
    return this.met.includes(id);
  }

  /** What is known about someone, in the order it is written. */
  facts(id: PersonId): string[] {
    const p = BY_ID.get(id);
    if (!p) return [];
    return p.facts.flatMap((f, i) => (!f.on || this.known.has(`${id}:${i}`) ? [f.text] : []));
  }
}

// ---------------------------------------------------------------------------------------------
// the look: the first-meeting card, the PEOPLE page (styles injected once; ZARYA only)
// ---------------------------------------------------------------------------------------------

const CSS = `
.zy-meet{position:absolute;left:calc(1.1em + env(safe-area-inset-left,0px));top:33%;z-index:3;display:grid;grid-template-columns:auto 1fr;gap:.2em .75em;align-items:center;
  max-width:min(22em,40vw);padding:.55em 1em .55em .55em;pointer-events:none;
  background:linear-gradient(90deg,rgba(6,9,7,.86),rgba(6,9,7,.72) 80%,rgba(6,9,7,0));border-left:3px solid var(--pc)}
.zy-meet[hidden]{display:none}
.zy-meet img{grid-row:span 3;width:4.6em;height:4.6em;border-radius:6px;border:2px solid var(--pc);object-fit:cover;background:#0b0f14}
.zy-meet .lbl{font-size:.62em;letter-spacing:.24em;color:rgba(240,244,230,.55);font-weight:700}
.zy-meet .nm{font-size:1.02em;letter-spacing:.16em;font-weight:800;color:var(--pc);line-height:1.1}
.zy-meet .who{font-size:.8em;letter-spacing:.02em;text-transform:none;font-weight:500;color:#e6ecdc;line-height:1.3}
html.ds-touch .zy-meet{top:27%;font-size:.94em;max-width:min(19em,38vw)}
.zy-people{margin-top:6px}
.zy-people .zy-person{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;padding:8px 0;border-top:1px solid rgba(255,255,255,.08)}
.zy-people .zy-person img{grid-row:span 3;width:56px;height:56px;border-radius:6px;border:2px solid var(--pc);object-fit:cover;background:#0b0f14}
.zy-people .nm{font-size:12px;font-weight:800;letter-spacing:.14em;color:var(--pc)}
.zy-people .who{font-size:11px;opacity:.7;line-height:1.35}
.zy-people ul{margin:2px 0 0;padding-left:15px;font-size:12px;line-height:1.45}
`;

function injectCss(): void {
  if (typeof document === 'undefined' || document.getElementById('zy-people-css')) return;
  const s = document.createElement('style');
  s.id = 'zy-people-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** How long a first-meeting card stays up; and how long at least, when someone new has spoken since. */
const CARD_SECS = 5.5;
const CARD_MIN = 2.4;

// ---------------------------------------------------------------------------------------------
// name plates over the sleepers the story names
// ---------------------------------------------------------------------------------------------

/** How close the player must be to read a sleeper's name. */
const PLATE_NEAR = 7;

interface Plate {
  readonly id: PersonId;
  readonly sprite: THREE.Sprite;
  readonly x: number;
  readonly z: number;
  readonly y: number;
}

const isKid = (p: Person): boolean => p.role === 'child' || p.role === 'kostya' || p.role === 'girl';
/** The top of a townsperson's hat (as `crowd.ts` sizes them), a little over it for the plate. */
const plateY = (p: Person): number => (p.role === 'danya' ? p.y + 0.9 : p.y + 1.82 * (isKid(p) ? 0.64 + p.seed * 0.1 : 0.93 + p.seed * 0.14) + 0.2);

/** Which of the town's sleepers carry which name. Lida and the Sorokins are whoever stands where Nina says they do. */
export function namedSleepers(list: readonly Person[] = townsfolk()): { id: PersonId; label: string; p: Person }[] {
  const out: { id: PersonId; label: string; p: Person }[] = [];
  const role = (r: Person['role'], id: PersonId, label: string): void => {
    for (const p of list) if (p.role === r) out.push({ id, label, p });
  };
  role('nina', 'nina', 'NINA PAVLOVNA');
  role('kostya', 'kostya', 'KOSTYA');
  role('zina', 'zina', 'TYOTYA ZINA');
  role('babushka', 'babushka', "VERA'S BABUSHKA");
  role('danya', 'danya', 'DANYA');
  const near = (x: number, z: number, n: number, ok: (p: Person) => boolean): Person[] =>
    list
      .filter(ok)
      .map((p) => [p, Math.hypot(p.x - x, p.z - z)] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, n)
      .map(([p]) => p);
  // "the one by the kiosk in the blue scarf is Lida": the grown-up nearest the tea kiosk's counter, out on the aisle
  const tea = KIOSKS.find((k) => k.kind === 'tea') ?? KIOSKS[0]!;
  for (const p of near(tea.x + tea.face * 2.5, tea.z, 1, (q) => q.role === 'towns' && q.solid)) out.push({ id: 'lida', label: 'LIDA', p });
  // "the Sorokins by the slide. All five": the five standing nearest the foot of the ice slide
  for (const p of near(-40, 33, 5, (q) => (q.role === 'towns' || q.role === 'child') && q.solid)) out.push({ id: 'sorokins', label: 'SOROKIN', p });
  return out;
}

const plateMats = new Map<string, THREE.SpriteMaterial>();
function plateMat(label: string, color: string): THREE.SpriteMaterial {
  const key = `${label}|${color}`;
  let m = plateMats.get(key);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 22px system-ui, sans-serif';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(label, 128, 22, 248);
  g.fillStyle = color;
  g.fillText(label, 128, 22, 248);
  g.font = '700 12px system-ui, sans-serif';
  g.lineWidth = 3;
  g.strokeText('ASLEEP', 128, 41, 248);
  g.fillStyle = 'rgba(220,235,255,0.85)';
  g.fillText('ASLEEP', 128, 41, 248);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.62 });
  plateMats.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// the runtime piece
// ---------------------------------------------------------------------------------------------

/** What `ZaryaPeople` needs of the game. */
export interface PeopleHost {
  radioHook: ((speaker: string, text: string, duration?: number) => boolean) | null;
  hudEvent(e: { type: 'radio'; speaker: string; text: string; duration?: number; face?: RadioFace }): void;
  readonly audio: { play(id: 'radio_chirp', opts?: { priority?: number; volume?: number }): void };
}

export class ZaryaPeople {
  readonly know = new Acquaintance();
  private readonly plates: Plate[] = [];
  private readonly root = new THREE.Group();
  private card: HTMLDivElement | null = null;
  private readonly cards: PersonId[] = [];
  private cardT = 0;
  private fade: Animation | null = null;
  private plateT = 0;
  private readonly hook: (speaker: string, text: string, duration?: number) => boolean;

  constructor(
    private readonly g: PeopleHost,
    parent: THREE.Object3D,
  ) {
    injectCss();
    // the speakers' portraits are fetched now (about 15 KB each), so no line ever shows an empty frame
    if (typeof Image === 'function') for (const p of PEOPLE) if (p.speaker) new Image().src = portraitUrl(p.id);
    this.root.name = 'ZaryaNamePlates';
    parent.add(this.root);
    for (const { id, label, p } of namedSleepers()) {
      const def = BY_ID.get(id)!;
      const s = new THREE.Sprite(plateMat(label, def.color));
      s.scale.set(0.95, 0.178, 1);
      s.position.set(p.x, plateY(p), p.z);
      s.visible = false;
      s.renderOrder = 2;
      this.root.add(s);
      this.plates.push({ id, sprite: s, x: p.x, z: p.z, y: p.y });
    }
    // every line said on ZARYA's wire comes through here: the face goes on the caption, and the speaker is met
    this.hook = (speaker, text, duration) => {
      const face = faceOf(speaker);
      const intro = this.know.heard(speaker, text);
      if (intro) this.cards.push(intro);
      g.hudEvent({ type: 'radio', speaker, text, duration, face: face ?? undefined });
      g.audio.play('radio_chirp', { priority: 1, volume: 0.5 });
      return true;
    };
    g.radioHook = this.hook;
  }

  reset(): void {
    this.know.reset();
    this.cards.length = 0;
    this.cardT = 0;
    this.hideCard();
    for (const pl of this.plates) pl.sprite.visible = false;
  }

  /** Every frame: the card on show, and the plates near the player (looked at a few times a second). */
  update(dt: number, at: { x: number; y: number; z: number }): void {
    this.cardT -= dt;
    // someone new has spoken: the card on show gives way soon, so a card is always for whoever has just spoken
    if (this.cards.length && this.cardT <= CARD_SECS - CARD_MIN) this.cardT = 0;
    if (this.cardT <= 0) {
      this.hideCard();
      const next = this.cards.shift();
      if (next) this.showCard(next);
    }
    this.plateT -= dt;
    if (this.plateT > 0) return;
    this.plateT = 0.25;
    for (const pl of this.plates) {
      pl.sprite.visible = this.know.has(pl.id) && Math.abs(pl.y - at.y) < 3 && Math.hypot(pl.x - at.x, pl.z - at.z) < PLATE_NEAR;
    }
  }

  private showCard(id: PersonId): void {
    const p = BY_ID.get(id);
    const host = typeof document !== 'undefined' ? document.querySelector('.ds-hud') : null;
    if (!p || !host) return;
    if (!this.card) {
      this.card = document.createElement('div');
      this.card.className = 'zy-meet';
      this.card.setAttribute('role', 'status');
    }
    const c = this.card;
    if (c.parentElement !== host) host.appendChild(c);
    c.style.setProperty('--pc', p.color);
    c.replaceChildren();
    const img = document.createElement('img');
    img.src = portraitUrl(id);
    img.alt = '';
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = this.know.carded.size <= 1 ? 'MET  -  IN THE JOURNAL' : 'MET';
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = p.name;
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = p.who;
    c.append(img, lbl, nm, who);
    c.hidden = false;
    this.cardT = CARD_SECS;
    if (typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      c.animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      this.fade?.cancel();
      this.fade = c.animate([{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: CARD_SECS * 1000, easing: 'linear' });
    }
  }

  private hideCard(): void {
    if (this.card) this.card.hidden = true;
  }

  /** The journal's PEOPLE page: everyone met so far, the squad first, with what is known about each. */
  page(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'zy-people';
    const h = document.createElement('h3');
    h.textContent = `PEOPLE  -  ${this.know.met.length} MET`;
    h.style.cssText = 'margin:10px 0 4px;font-size:12px;letter-spacing:.14em';
    root.appendChild(h);
    const order = PEOPLE.filter((p) => this.know.has(p.id)).map((p) => p.id);
    for (const id of order) {
      const p = BY_ID.get(id)!;
      const row = document.createElement('div');
      row.className = 'zy-person';
      row.style.setProperty('--pc', p.color);
      const img = document.createElement('img');
      img.src = portraitUrl(id);
      img.alt = '';
      img.loading = 'lazy';
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = p.name;
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = p.who;
      const ul = document.createElement('ul');
      for (const f of this.know.facts(id)) {
        const li = document.createElement('li');
        li.textContent = f;
        ul.appendChild(li);
      }
      row.append(img, nm, who, ul);
      root.appendChild(row);
    }
    return root;
  }

  dispose(): void {
    if (this.g.radioHook === this.hook) this.g.radioHook = null;
    this.card?.remove();
    this.root.removeFromParent();
  }
}
