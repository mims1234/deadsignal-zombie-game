/**
 * ZARYA's story as pure state (no THREE): the solo game runs one; the co-op simulation runs the shared one and sends it
 * on (`encodeStory`); every screen draws what it says (`runtime.ts`).
 *
 * ACT I    "Three Minutes to Midnight" (`research_notes/zarya/phase0.html` has its script)
 *   ARRIVE   the town awake. From the van across the fair to the Univermag's staff door, down to the shelter. When the
 *            whole squad is inside, Nina shuts the blast door as she has every night for thirty years - and the quiet
 *            snow comes down on the town.
 *   SEALED   00:41 by a phone, 23:57 by every clock. Nina's pistols; the manual release.
 *   GROUND   up into the store. Gena from the meat rows is the first one who does not breathe.
 *   TOWN     the jammed shutter and its guard; the noticeboard; the Signalka; Ded Moroz's sack and the bear who guards
 *            it (the SUN key); Line One's handle and fuse. Boarding the tram ends the act.
 * ACT II   "Next Stop": the tram runs, and the town opens zone by zone, each a different way.
 *   FIND     the Rynok and the Dvor open with the tram. Vera's grandmother is at her window.
 *   BUILD    bolt cutters (shears, pipe handles, friction tape) cut the chains on the depot and the garages. At Timur's
 *            bench in the garages: the nail gun, the Salyut, the bear spear.
 *   LURE     Borya the Butcher is led into his own cold store and the door barred behind him (the COSMONAUT key).
 *   BUY      three pageant tickets open the Dom Kultury. Baba Yaga sits in her hut with its back to the hall: the
 *            stage's lever turns it (the WHEAT key). The museum's plaque has the year the town was founded.
 *   FIGHT    a heavy blow breaks the padlock on the Univermag's escalator: upstairs, the staff party and its
 *            toastmaster, whose three loudspeakers must be unplugged (the DOVE key).
 * ACT III  "The Thaw"
 *   FIGHT    kills made near the three painted matryoshkas open their shells; the smallest showing in all three, the
 *            frozen gate on the pond road gives: the banya, the pond, the heating plant.
 *   SOLVE    the Institute's checkpoint wants four digits: the year on the museum's plaque.
 *   THE END  the four keys open the Berloga hall. Dr Zimin, as Morozko, asks his question. Then the purge console's
 *            four switches: in the mosaic's order the whole town wakes; in any other, only its heated buildings.
 *            Enough sleepers covered against the cold, and the right answer, and he turns the keys himself.
 *
 * Nothing is timed. Nothing can be failed or missed: what has happened stays happened.
 */
import { BANYA, BERLOGA, CANTEEN, DEPOT, DK, DVOR, GARAGES, GATES, INSTITUTE, RYNOK, SHELTER, STOPS, TETS, ZARYA, ZARYA_ZONES, inRect, inShelter, onSquare, type GateKey, type Spot, type StopKey, type ZaryaZone } from './places';
import { CHAIN, PART, RECIPE, TOWN, Unlock, type UnlockEvent, type UnlockView } from './unlock';

export const CH = { arrive: 0, sealed: 1, ground: 2, town: 3, act2: 4, finale: 5, ended: 6 } as const;

/** What has happened in Act I, one bit each. */
export const F = {
  /** The pistols are off the rack: everyone is armed from here on. */
  armed: 1 << 0,
  released: 1 << 1,
  gena: 1 << 2,
  /** The guard under the shutter has been woken; he is down; the shutter's plug is out. */
  guard: 1 << 3,
  guardDown: 1 << 4,
  plug: 1 << 5,
  notice: 1 << 6,
  flare: 1 << 7,
  /** Someone has looked into Zina's cab; into the stop's empty fuse box. */
  line: 1 << 8,
  fuseBox: 1 << 9,
  handleFit: 1 << 10,
  fuseFit: 1 << 11,
  /** The bear is up (someone took from the sack); he is down (the Sun key). */
  bear: 1 << 12,
  bearDown: 1 << 13,
  /** A prize hangs on the slide's hook: the bear has gone to see to it. */
  prize: 1 << 14,
  /** Someone has come up into the store's hall. */
  hall: 1 << 15,
} as const;

/** What has happened since the tram first ran, one bit each. */
export const G = {
  /** Borya has seen the squad; he is inside his cold store now (it comes and goes); the door is barred on him. */
  borya: 1 << 0,
  boryaIn: 1 << 1,
  barred: 1 << 2,
  cosmoKey: 1 << 3,
  /** Three tickets bought: the Palace's doors are open. Baba Yaga has noticed the squad; her hut faces the hall now; she is down. */
  tickets: 1 << 4,
  yaga: 1 << 5,
  exposed: 1 << 6,
  yagaDown: 1 << 7,
  /** The escalator's padlock is broken. The Tamada has noticed the squad; he is down. */
  escalator: 1 << 8,
  tamada: 1 << 9,
  tamadaDown: 1 << 10,
  /** The fire board's lock and the museum's glass, broken by a heavy blow. */
  fireBoard: 1 << 11,
  sickleCase: 1 << 12,
  /** The ornaments are back on the town tree: the museum guard's cabinet stands open. */
  hung: 1 << 13,
  /** The pond road's gate has given (the three matryoshkas). The checkpoint's code is in. */
  pond: 1 << 14,
  code: 1 << 15,
  /** The four keys are in the Berloga's door. Morozko has asked; the squad has answered "warm"; he believed it; he is down. */
  keyDoor: 1 << 16,
  asked: 1 << 17,
  answered: 1 << 18,
  believed: 1 << 19,
  morozkoDown: 1 << 20,
} as const;

/** Things to notice: each is somewhere, and says something about what happened to the town. */
export const CLUES: readonly { id: string; name: string; at: Spot; zone: ZaryaZone }[] = [
  { id: 'tv', name: 'THE TELEVISION', at: DVOR.tv, zone: 'dvor' },
  { id: 'ledger', name: "THE BUTCHER'S LEDGER", at: RYNOK.ledger, zone: 'rynok' },
  { id: 'crates', name: 'THE CRATES', at: GARAGES.crates, zone: 'garages' },
  { id: 'sheet', name: "ZINA'S ROUTE SHEET", at: DEPOT.sheet, zone: 'depot' },
  { id: 'plaque', name: 'THE BRASS PLAQUE', at: DK.plaque, zone: 'dk' },
  { id: 'photo', name: 'THE PHOTOGRAPH', at: DK.photo, zone: 'dk' },
  { id: 'faces', name: 'THE BATHERS', at: BANYA.faces, zone: 'banya' },
  { id: 'pipe', name: 'THE NEW PIPE', at: TETS.pipe, zone: 'tets' },
  { id: 'clock', name: 'THE MASTER CLOCK', at: INSTITUTE.clockRoom, zone: 'institute' },
  { id: 'office', name: "THE DIRECTOR'S OFFICE", at: INSTITUTE.office, zone: 'institute' },
  { id: 'dens', name: 'THE GLASS DENS', at: BERLOGA.dens, zone: 'berloga' },
  { id: 'danya', name: 'BED FORTY-ONE', at: BERLOGA.danya, zone: 'berloga' },
];
export const CLUE = { tv: 0, ledger: 1, crates: 2, sheet: 3, plaque: 4, photo: 5, faces: 6, pipe: 7, clock: 8, office: 9, dens: 10, danya: 11 } as const;

/** Sleepers who can be covered against the cold (Vera's "hundred and ninety-nine to go"). */
export const COVERS: readonly Spot[] = [ZARYA.girl, DVOR.babushka, ...RYNOK.cover, ...DVOR.cover, ...GARAGES.cover, ...DEPOT.cover, ...DK.cover, ...BANYA.cover, ...TETS.cover, ...INSTITUTE.cover, BERLOGA.danya];
/** The glass ornaments missing from the town tree. */
export const ORNAMENTS: readonly Spot[] = [{ x: 96.4, z: 0.4 }, { x: -13, z: 26 }, RYNOK.ornament, DVOR.ornament, GARAGES.ornament, DEPOT.ornament];
/** The three painted matryoshkas. */
export const DOLLS: readonly Spot[] = [{ x: 44, z: -24 }, RYNOK.doll, DVOR.doll];
/** The repairman's three tools, to be brought back to his booth. */
export const TOOLS: readonly Spot[] = [DVOR.tool, GARAGES.tool, DEPOT.tool];
/** The workbenches (the strong weapons are built only at the last two: Timur's, and the Institute's lab bench). */
export const BENCHES: readonly { at: Spot; main: boolean }[] = [
  { at: ZARYA.bench, main: false },
  { at: DVOR.bench, main: false },
  { at: GARAGES.bench, main: true },
  { at: INSTITUTE.bench, main: true },
];
/** The four keys, in the order of the figures on the Univermag's mosaic. */
export const KEYS = ['COSMONAUT', 'SUN', 'WHEAT', 'DOVE'] as const;

export const STORY = {
  /** How close a player must stand to something to use it. */
  reach: 3,
  /** The guard wakes when anyone comes this near the shutter. */
  guardWake: 13,
  /** Seconds the bear spends at the hook over a hung prize; seconds Baba Yaga's hut faces the hall after a pull. */
  prize: 16,
  exposed: 14,
  /** A matryoshka opens one shell for every so many kills made within its reach; five shells. */
  dollKills: 4,
  dollShells: 5,
  dollReach: 26,
  /** What three pageant tickets cost (one player pays for the squad). */
  tickets: 900,
  /** Sleepers covered for Morozko to believe the answer. */
  warm: 9,
} as const;

export interface StoryView extends UnlockView {
  ch: number;
  f: number;
  /** `G`. */
  g: number;
  /** Bits: the canteen's three plugs pulled (0-2), the plant's three valves turned (3-5), the repairman's tools found (6-8). */
  m: number;
  clues: number;
  covered: number;
  orn: number;
  /** Kills counted at each doll, six bits apiece. */
  dolls: number;
  /** The purge console's keys turned so far, in order: one digit 1..4 each (the mosaic's order is 1234). */
  turned: number;
  /** How it ended: 1 the whole town wakes, 2 only the heated buildings, 3 he turned the keys himself. */
  end: number;
}

export type StoryEvent =
  | UnlockEvent
  | { kind: 'chapter'; ch: number }
  | { kind: 'flag'; f: number }
  | { kind: 'g'; g: number }
  | { kind: 'clue'; i: number }
  | { kind: 'cover'; i: number; n: number }
  | { kind: 'ornament'; i: number; n: number }
  | { kind: 'doll'; i: number; shells: number }
  | { kind: 'plug'; i: number; n: number }
  | { kind: 'valve'; i: number; n: number }
  | { kind: 'tool'; i: number; n: number }
  | { kind: 'turn'; key: number; n: number }
  | { kind: 'end'; end: number };

/** What a player can ask for (each is checked against where they stand). */
export type StoryAct =
  | 'arm' | 'release' | 'plug' | 'notice' | 'part' | 'build' | 'flare' | 'line' | 'fusebox' | 'fitHandle' | 'fitFuse' | 'prize' | 'board'
  | 'cut' | 'tickets' | 'clue' | 'cover' | 'ornament' | 'hang' | 'tool' | 'bar' | 'cosmoKey' | 'lever' | 'escalator' | 'unplug' | 'fireBoard' | 'sickleCase'
  | 'code' | 'valve' | 'slots' | 'answer' | 'turn';

/** Someone standing somewhere (the players). */
export interface Stand {
  x: number;
  z: number;
  up: boolean;
}

/** Where each thing a player uses is (the ones with an index take theirs from the lists above). */
export const AT = {
  arm: ZARYA.rack,
  release: ZARYA.release,
  plug: ZARYA.plug,
  notice: ZARYA.noticeboard,
  line: ZARYA.cab,
  fusebox: ZARYA.fuseBox,
  fitHandle: ZARYA.cab,
  fitFuse: ZARYA.fuseBox,
  prize: ZARYA.hook,
  board: ZARYA.tramDoor,
  /** The box office window, on the square beside the Palace's doors. */
  tickets: { x: -79.4, z: -17.6 } as Spot,
  hang: { x: ZARYA.tree.x, z: ZARYA.tree.z + ZARYA.tree.r + 1.2 } as Spot,
  bar: RYNOK.bar,
  cosmoKey: RYNOK.keyHook,
  lever: DK.lever,
  escalator: { x: 112, z: 0.6 } as Spot,
  fireBoard: DEPOT.fireBoard,
  sickleCase: DK.sickleCase,
  cabinet: DK.cabinet,
  code: TETS.keypad,
  slots: BERLOGA.slots,
  /** The Garden shears lie in the store's housewares; everything else is in its zone's own file. */
} as const;

const near = (p: { x: number; z: number }, t: Spot, r: number): boolean => Math.hypot(p.x - t.x, p.z - t.z) <= r + 0.6;
const bit = (i: number): number => 1 << i;
const count = (mask: number): number => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
};

export class ZaryaStory {
  readonly unlock = new Unlock(TOWN);
  private ch: number = CH.arrive;
  private f = 0;
  private g = 0;
  private m = 0;
  private clues = 0;
  private covered = 0;
  private orn = 0;
  private dolls = 0;
  private turned = 0;
  private end = 0;
  private events: StoryEvent[] = [];

  static empty(): StoryView {
    return { ch: CH.arrive, f: 0, g: 0, m: 0, clues: 0, covered: 0, orn: 0, dolls: 0, turned: 0, end: 0, parts: 0, built: 0, gates: 0 };
  }

  get view(): StoryView {
    const u = this.unlock.view;
    return { ch: this.ch, f: this.f, g: this.g, m: this.m, clues: this.clues, covered: this.covered, orn: this.orn, dolls: this.dolls, turned: this.turned, end: this.end, parts: u.parts, built: u.built, gates: u.gates };
  }

  static has(v: { f: number }, flag: number): boolean {
    return (v.f & flag) !== 0;
  }
  static did(v: { g: number }, flag: number): boolean {
    return (v.g & flag) !== 0;
  }
  /** How many of something a mask holds. */
  static count = count;
  /** How many shells of doll `i` have opened. */
  static shells(v: { dolls: number }, i: number): number {
    return Math.min(STORY.dollShells, Math.floor(((v.dolls >> (i * 6)) & 63) / STORY.dollKills));
  }
  /** The keys the squad holds, in the mosaic's order. */
  static keys(v: StoryView): boolean[] {
    return [ZaryaStory.did(v, G.cosmoKey), ZaryaStory.has(v, F.bearDown), ZaryaStory.did(v, G.yagaDown), ZaryaStory.did(v, G.tamadaDown)];
  }

  reset(): void {
    this.unlock.reset();
    this.ch = CH.arrive;
    this.f = this.g = this.m = this.clues = this.covered = this.orn = this.dolls = this.turned = this.end = 0;
    this.events = [];
  }

  /** What happened since the last call (for whoever plays the sound and says the line). */
  drain(): StoryEvent[] {
    const e = [...this.events, ...this.unlock.drain()];
    this.events = [];
    return e;
  }

  private raise(flag: number): boolean {
    if (this.f & flag) return false;
    this.f |= flag;
    this.events.push({ kind: 'flag', f: flag });
    return true;
  }
  private does(flag: number): boolean {
    if (this.g & flag) return false;
    this.g |= flag;
    this.events.push({ kind: 'g', g: flag });
    return true;
  }
  private chapter(ch: number): void {
    if (ch <= this.ch) return;
    this.ch = ch;
    this.events.push({ kind: 'chapter', ch });
  }

  // ---------------------------------------------------------------------------------------------
  // what is open
  // ---------------------------------------------------------------------------------------------

  /** A gate between zones is open. */
  static gateOpen(v: StoryView, key: GateKey): boolean {
    switch (key) {
      case 'act2':
        return v.ch >= CH.act2;
      case 'cutDepot':
        return Unlock.has(v.gates, CHAIN.depot);
      case 'cutNorth':
        return Unlock.has(v.gates, CHAIN.garagesN);
      case 'cutWest':
        return Unlock.has(v.gates, CHAIN.garagesW);
      case 'tickets':
        return (v.g & G.tickets) !== 0;
      case 'pond':
        return (v.g & G.pond) !== 0;
      case 'code':
        return (v.g & G.code) !== 0;
    }
  }

  /** Line One calls at a stop. */
  static stopOpen(v: StoryView, key: StopKey): boolean {
    if (key === 'always') return true;
    if (key === 'act2') return v.ch >= CH.act2;
    if (key === 'cutDepot') return Unlock.has(v.gates, CHAIN.depot);
    return (v.g & G.pond) !== 0;
  }

  /** A zone can be reached (the infected come only where the squad can). */
  static zoneOpen(v: StoryView, id: ZaryaZone): boolean {
    switch (id) {
      case 'shelter':
        return false;
      case 'square':
      case 'store':
        return v.ch >= CH.town;
      case 'rynok':
      case 'dvor':
        return v.ch >= CH.act2;
      case 'garages':
        return Unlock.has(v.gates, CHAIN.garagesN) || Unlock.has(v.gates, CHAIN.garagesW);
      case 'depot':
        return Unlock.has(v.gates, CHAIN.depot);
      case 'dk':
        return (v.g & G.tickets) !== 0;
      case 'banya':
      case 'tets':
        return (v.g & G.pond) !== 0;
      case 'institute':
        return (v.g & G.code) !== 0;
      case 'canteen':
        return (v.g & G.escalator) !== 0;
      case 'berloga':
        return v.ch >= CH.finale && (v.g & G.asked) !== 0 && (v.g & (G.believed | G.morozkoDown)) === 0;
    }
  }

  /** The zone a point is in. */
  static zoneOf(x: number, z: number): ZaryaZone | null {
    for (const q of ZARYA_ZONES) if (x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1) return q.id;
    return null;
  }

  /** The blast door stands shut from the moment it seals until the manual release. */
  static doorShut(v: StoryView): boolean {
    return v.ch === CH.sealed;
  }
  /** The town is asleep (from the moment the door seals). */
  static asleep(v: StoryView): boolean {
    return v.ch >= CH.sealed && v.end !== 1 && v.end !== 3;
  }
  /** The cold store's door is barred. */
  static coldShut(v: StoryView): boolean {
    return (v.g & G.barred) !== 0;
  }
  /** The Berloga's door stands shut until the four keys are in it. */
  static keyDoorShut(v: StoryView): boolean {
    return (v.g & G.keyDoor) === 0;
  }

  // ---------------------------------------------------------------------------------------------
  // what a player may do
  // ---------------------------------------------------------------------------------------------

  /** Where act `act` (with index `i`) is done. */
  static where(act: StoryAct, i = 0): Spot | null {
    switch (act) {
      case 'part':
        return TOWN.parts[i] ?? null;
      case 'build':
        return null;
      case 'flare':
        return null;
      case 'cut':
        return GATES.find((q) => q.id === TOWN.gates[i]?.id) ?? null;
      case 'clue':
        return CLUES[i]?.at ?? null;
      case 'cover':
        return COVERS[i] ?? null;
      case 'ornament':
        return ORNAMENTS[i] ?? null;
      case 'tool':
        return TOOLS[i] ?? null;
      case 'unplug':
        return CANTEEN.plugs[i] ?? null;
      case 'valve':
        return TETS.valves[i] ?? null;
      case 'turn':
        return BERLOGA.keys[i] ?? null;
      case 'answer':
        return BERLOGA.morozko;
      default:
        return (AT as Record<string, Spot>)[act] ?? null;
    }
  }

  /** What a player may do at this moment (the prompt is shown only when this says so). */
  static can(v: StoryView, act: StoryAct, i = 0): boolean {
    const has = (flag: number): boolean => (v.f & flag) !== 0;
    const did = (flag: number): boolean => (v.g & flag) !== 0;
    const act2 = v.ch >= CH.act2 && v.ch < CH.ended;
    switch (act) {
      case 'arm':
        return v.ch >= CH.sealed && !has(F.armed);
      case 'release':
        return v.ch === CH.sealed && has(F.armed);
      case 'plug':
        return has(F.guardDown) && !has(F.plug);
      case 'notice':
        return v.ch >= CH.ground && !has(F.notice);
      case 'part': {
        if (Unlock.has(v.parts, i) || i < 0 || i >= TOWN.parts.length) return false;
        if (i === PART.tube) return v.ch >= CH.sealed;
        // nobody pulls a fuse out of the town's tree until they know the stop's own is missing
        if (i === PART.fuse) return has(F.fuseBox);
        if (i <= PART.handle) return v.ch >= CH.ground;
        // the rest of the town's parts lie where anyone would walk past them; they mean something once the tram runs
        return act2;
      }
      case 'build':
        return i !== RECIPE.line && Unlock.canBuild(TOWN, v, i);
      case 'flare':
        return Unlock.has(v.built, RECIPE.signalka) && !has(F.flare);
      case 'line':
        return v.ch >= CH.town && !has(F.line);
      case 'fusebox':
        return has(F.line) && !has(F.fuseBox);
      case 'fitHandle':
        return has(F.line) && Unlock.has(v.parts, PART.handle) && !has(F.handleFit);
      case 'fitFuse':
        return has(F.fuseBox) && Unlock.has(v.parts, PART.fuse) && !has(F.fuseFit);
      case 'prize':
        return has(F.bear) && !has(F.bearDown) && !has(F.prize);
      case 'board':
        return v.ch === CH.town && Unlock.has(v.built, RECIPE.line);
      case 'cut':
        return act2 && Unlock.canOpen(TOWN, v, i);
      case 'tickets':
        return act2 && !did(G.tickets);
      case 'clue':
        if (i < 0 || i >= CLUES.length || (v.clues & bit(i)) !== 0) return false;
        // the hall's own are there to be seen from the moment its door opens
        return CLUES[i]!.zone === 'berloga' ? v.ch >= CH.finale : ZaryaStory.zoneOpen(v, CLUES[i]!.zone);
      case 'cover':
        return i >= 0 && i < COVERS.length && (v.covered & bit(i)) === 0 && (i === 0 ? has(F.gena) : act2 || v.ch >= CH.finale);
      case 'ornament':
        return i >= 0 && i < ORNAMENTS.length && (v.orn & bit(i)) === 0 && act2;
      case 'hang':
        return act2 && !did(G.hung) && count(v.orn) === ORNAMENTS.length;
      case 'tool':
        return act2 && i >= 0 && i < TOOLS.length && (v.m & bit(6 + i)) === 0;
      case 'bar':
        return did(G.boryaIn) && !did(G.barred);
      case 'cosmoKey':
        return did(G.barred) && !did(G.cosmoKey);
      case 'lever':
        return did(G.yaga) && !did(G.yagaDown) && !did(G.exposed);
      case 'escalator':
        return act2 && !did(G.escalator);
      case 'unplug':
        return did(G.tamada) && !did(G.tamadaDown) && i >= 0 && i < 3 && (v.m & bit(i)) === 0;
      case 'fireBoard':
        return act2 && !did(G.fireBoard);
      case 'sickleCase':
        return did(G.tickets) && !did(G.sickleCase);
      case 'code':
        return did(G.pond) && !did(G.code) && (v.clues & bit(CLUE.plaque)) !== 0;
      case 'valve':
        return did(G.pond) && i >= 0 && i < 3 && (v.m & bit(3 + i)) === 0;
      case 'slots':
        return did(G.code) && !did(G.keyDoor) && ZaryaStory.keys(v).every(Boolean);
      case 'answer':
        return did(G.asked) && !did(G.answered) && !did(G.morozkoDown);
      case 'turn': {
        if (!(did(G.morozkoDown) || did(G.believed)) || v.end !== 0 || i < 0 || i > 3) return false;
        for (let t = v.turned; t > 0; t = Math.floor(t / 10)) if (t % 10 === i + 1) return false;
        return true;
      }
    }
  }

  /**
   * A player asks for something, standing at `p`. `heavy`: what is in their hands is a heavy thing to swing (the locks
   * and the glass want one). True when it happened.
   */
  act(act: StoryAct, i: number, p: { x: number; z: number }, heavy = false): boolean {
    const v = this.view;
    if (!ZaryaStory.can(v, act, i)) return false;
    if (act === 'build') {
      const bench = BENCHES.find((q) => near(p, q.at, STORY.reach + 1));
      if (!bench) return false;
      // the strong ones want a proper bench
      if (i >= RECIPE.gvozdomyot && !bench.main) return false;
      return this.unlock.build(i);
    }
    if (act === 'flare') return onSquare(p.x, p.z) && this.raise(F.flare);
    const at = ZaryaStory.where(act, i);
    if (!at || !near(p, at, STORY.reach + (act === 'board' || act === 'cut' || act === 'answer' ? 3 : 0))) return false;
    switch (act) {
      case 'arm':
        return this.raise(F.armed);
      case 'release':
        this.raise(F.released);
        this.chapter(CH.ground);
        return true;
      case 'plug':
        return this.raise(F.plug);
      case 'notice':
        return this.raise(F.notice);
      case 'part':
        return this.unlock.takePart(i);
      case 'line':
        return this.raise(F.line);
      case 'fusebox':
        return this.raise(F.fuseBox);
      case 'fitHandle':
        this.raise(F.handleFit);
        this.fitted();
        return true;
      case 'fitFuse':
        this.raise(F.fuseFit);
        this.fitted();
        return true;
      case 'prize':
        return this.raise(F.prize);
      case 'board':
        this.chapter(CH.act2);
        return true;
      case 'cut':
        return this.unlock.open(i);
      case 'tickets':
        return this.does(G.tickets);
      case 'clue':
        this.clues |= bit(i);
        this.events.push({ kind: 'clue', i });
        return true;
      case 'cover':
        this.covered |= bit(i);
        this.events.push({ kind: 'cover', i, n: count(this.covered) });
        return true;
      case 'ornament':
        this.orn |= bit(i);
        this.events.push({ kind: 'ornament', i, n: count(this.orn) });
        return true;
      case 'hang':
        return this.does(G.hung);
      case 'tool':
        this.m |= bit(6 + i);
        this.events.push({ kind: 'tool', i, n: count((this.m >> 6) & 7) });
        return true;
      case 'bar':
        return this.does(G.barred);
      case 'cosmoKey':
        return this.does(G.cosmoKey);
      case 'lever':
        return this.does(G.exposed);
      case 'escalator':
        return heavy && this.does(G.escalator);
      case 'fireBoard':
        return heavy && this.does(G.fireBoard);
      case 'sickleCase':
        return heavy && this.does(G.sickleCase);
      case 'unplug':
        this.m |= bit(i);
        this.events.push({ kind: 'plug', i, n: count(this.m & 7) });
        return true;
      case 'valve':
        this.m |= bit(3 + i);
        this.events.push({ kind: 'valve', i, n: count((this.m >> 3) & 7) });
        return true;
      case 'code':
        return this.does(G.code);
      case 'slots':
        this.does(G.keyDoor);
        this.chapter(CH.finale);
        return true;
      case 'answer':
        // "Warm, Dedushka": he believes it only of a squad that has kept others warm
        this.does(G.answered);
        if (count(this.covered) >= STORY.warm) this.does(G.believed);
        return true;
      case 'turn': {
        this.turned = this.turned * 10 + i + 1;
        const n = String(this.turned).length;
        this.events.push({ kind: 'turn', key: i, n });
        if (n === 4) this.finish((this.g & G.believed) !== 0 ? 3 : this.turned === 1234 ? 1 : 2);
        return true;
      }
    }
    return false;
  }

  private finish(end: number): void {
    if (this.end) return;
    this.end = end;
    this.events.push({ kind: 'end', end });
    this.chapter(CH.ended);
  }

  /** Handle and fuse both in: Line One runs. */
  private fitted(): void {
    if ((this.f & F.handleFit) && (this.f & F.fuseFit)) this.unlock.build(RECIPE.line);
  }

  /** What the infected report (`director.ts`). */
  note(what: 'gena' | 'guardDown' | 'bearUp' | 'bearDown' | 'prizeDone' | 'boryaUp' | 'boryaIn' | 'boryaOut' | 'yagaUp' | 'yagaDown' | 'hutBack' | 'tamadaUp' | 'tamadaDown' | 'morozkoDown'): void {
    switch (what) {
      case 'gena':
        if (this.raise(F.gena)) this.chapter(CH.town);
        break;
      case 'guardDown':
        this.raise(F.guardDown);
        break;
      case 'bearUp':
        this.raise(F.bear);
        break;
      case 'bearDown':
        this.raise(F.bearDown);
        this.f &= ~F.prize;
        break;
      case 'prizeDone':
        this.f &= ~F.prize;
        break;
      case 'boryaUp':
        this.does(G.borya);
        break;
      case 'boryaIn':
        this.g |= G.boryaIn;
        break;
      case 'boryaOut':
        if (!(this.g & G.barred)) this.g &= ~G.boryaIn;
        break;
      case 'yagaUp':
        this.does(G.yaga);
        break;
      case 'yagaDown':
        this.does(G.yagaDown);
        this.g &= ~G.exposed;
        break;
      case 'hutBack':
        this.g &= ~G.exposed;
        break;
      case 'tamadaUp':
        this.does(G.tamada);
        break;
      case 'tamadaDown':
        this.does(G.tamadaDown);
        break;
      case 'morozkoDown':
        this.does(G.morozkoDown);
        break;
    }
  }

  /** A kill made at (x, z): counted at any matryoshka in reach, until its last shell is open. */
  kill(x: number, z: number): void {
    if (this.ch < CH.act2 || (this.g & G.pond)) return;
    const max = STORY.dollKills * STORY.dollShells;
    DOLLS.forEach((d, i) => {
      const n = (this.dolls >> (i * 6)) & 63;
      if (n >= max || Math.hypot(d.x - x, d.z - z) > STORY.dollReach) return;
      this.dolls += 1 << (i * 6);
      if ((n + 1) % STORY.dollKills === 0) this.events.push({ kind: 'doll', i, shells: (n + 1) / STORY.dollKills });
    });
    if (DOLLS.every((_, i) => ((this.dolls >> (i * 6)) & 63) >= max)) this.does(G.pond);
  }

  /** Every frame on whoever runs the story: what happens by itself, from where the players stand. */
  step(stand: readonly Stand[]): void {
    const up = stand.filter((p) => p.up);
    if (up.length === 0) return;
    if (this.ch === CH.arrive) {
      // the blast door shuts behind the last of them
      if (up.every((p) => inShelter(p.x) && p.x > ZARYA.sealLine)) this.chapter(CH.sealed);
      return;
    }
    if (this.ch >= CH.ground && !(this.f & F.hall) && up.some((p) => p.z < 13.4 && p.x > 70.5 && p.x < 139.5 && p.z > -29.5)) this.raise(F.hall);
    if (this.ch >= CH.town && !(this.f & F.guard) && up.some((p) => near(p, ZARYA.shutter, STORY.guardWake) && p.x > 70 && p.x < 100)) this.raise(F.guard);
    // Morozko's question is asked of whoever crosses the hall
    if (this.ch === CH.finale && !(this.g & G.asked) && up.some((p) => inRect(BERLOGA.rect, p.x, p.z) && p.x > BERLOGA.askLine)) this.does(G.asked);
  }
}

/** The shared state as a co-op report's row, and back (null when the row is not one). */
export function encodeStory(v: StoryView): number[] {
  return [v.ch, v.f, v.parts, v.built, v.gates, v.g, v.m, v.clues, v.covered, v.orn, v.dolls, v.turned, v.end];
}

export function decodeStory(row: unknown): StoryView | null {
  if (!Array.isArray(row) || row.length < 13 || !row.every((n) => Number.isInteger(n) && n >= 0)) return null;
  const r = row as number[];
  return { ch: r[0]!, f: r[1]!, parts: r[2]!, built: r[3]!, gates: r[4]!, g: r[5]!, m: r[6]!, clues: r[7]!, covered: r[8]!, orn: r[9]!, dolls: r[10]!, turned: r[11]!, end: r[12]! };
}

void SHELTER;
void STOPS;
