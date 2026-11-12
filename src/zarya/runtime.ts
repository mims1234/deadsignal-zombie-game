/**
 * ZARYA on screen: the story (`story.ts`) run against the world, all three acts. It asks the story for what the player
 * may do where they stand (`ZaryaStory.can`), shows that as the one USE prompt, says the script's lines as captions on
 * the wire one after another (none skipped, none talked over), keeps the HUD's list to five lines of what is open now,
 * runs Line One between its stops, switches the zones of scenery, and has the town drawn (`look.ts`).
 *
 * Solo it is the authority and runs the infected's director too. In co-op the simulation is (`sim/serverHost.ts`): the
 * story comes back in its reports (`applyWire`) and using something only asks for it (`request`). Either way the screen
 * reacts to the state changing, not to who changed it. What a player buys, takes from a bench or picks up to swing is
 * their own.
 *
 * There is no clock anywhere in it, and the only way to lose is for the squad to go down.
 */
import { PLAYER, WEAPONS } from '../config';
import type { Zombie } from '../enemies/zombie';
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';
import { addGun, createCarried, slotOf } from '../logic/economy';
import { isFull } from '../logic/ammo';
import { MELEE } from '../logic/melee';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import { ZoneSwitch } from '../world/zones';
import { ZaryaDirector, type Named } from './director';
import { applyDoors } from './doors';
import { zaryaPull, zaryaVariantPicker } from './kinds';
import { LINES, NINA_WIRE, SACK_MOVED, lineSeconds, type Beat, type Line } from './lines';
import { TownLook } from './look';
import { SACK_EVERY, SACK_PLACES, nextSackPlace, sackPlaceOpen } from './sack';
import { ZenitPhotos } from './photos';
import { MorozkoQuestion } from './weakPoints';
import { BANYA, BERLOGA, CANTEEN, DEPOT, DK, GATES, INSTITUTE, RYNOK, STOPS, TETS, UPSTAIRS, ZARYA, ZARYA_ZONES, inInterior, inRect, inShelter, inStore, onSquare, type Spot, type ZaryaZone } from './places';
import { AT, BENCHES, CH, CLUE, CLUES, COVERS, DOLLS, F, G, KEYS, ORNAMENTS, STORY, TOOLS, ZaryaStory, decodeStory, type StoryAct, type StoryView } from './story';
// (kiosks and mods: the shutters, the weapon mods, the repair booth's tools)
import { KiosksAndMods } from './modsRuntime';
// ---- the people: a name, a colour and a face on every line, first-meeting cards, the PEOPLE page, sleepers' names (`people.ts`) ----
import { ZaryaPeople } from './people';
import { CHAIN, OKHOTNIK, PART, POLICE, RECIPE, TOWN, Unlock, buyOffer, type Gives, type OfferDef } from './unlock';
// (items, round 3: every part, tool and ornament has a picture: the feed, the HUD list, the journal, the bench card)
import { MOD_ICON, ornamentIcon, partIcon, toolIcon } from './items';
import type { HudIcon, ItemCard } from '../ui/hudTypes';
import { journalBuilds, journalIcons, type JournalBuild } from '../ui/hudItems';

/** How near a thing lying about has to be to be picked up in passing. */
const PICKUP = 2.4;
/** Where each part is, in words (the HUD's list and the journal), in the order of `TOWN.parts`. */
const WHERE = [
  'the shelter kit, in the storeroom',
  'the fireworks kiosk at the fair',
  'the tea room, in the Univermag',
  "the box the tree's lights run from",
  'housewares, in the Univermag',
  "a plumber's stall in the Rynok",
  'the workbench shelf in the Dvor',
  "a builder's garage",
  "a welder's stall in the Rynok",
  "the track gang's store at the depot",
  'a pipe rack in the garages',
  'beside the stage on the square',
  'the playground in the Dvor',
  "the Okhotnik's window, by the depot",
  "the yard-keeper's shed in the Dvor",
  'the welding set in the garages',
  'the tea stall in the Rynok',
  "the banya's stove",
  'the pump house at the heating plant',
  "a cold cabinet in the Institute's labs",
];
/** What each recipe is called in a prompt or a line of the list, in the order of `TOWN.recipes`. */
const SHORT = ['SIGNALKA', 'LINE ONE', 'BOLT CUTTERS', 'NAIL GUN', 'SALYUT', 'ROGATINA', 'OTTEPEL'];
/** The clues that are read rather than looked at, and what the prompt calls the ones whose name is a place. */
const READ = new Set(['ledger', 'sheet', 'plaque']);
const CLUE_VERB: Record<string, string> = { office: 'READ THE NOTES ON THE DESK', dens: 'LOOK INTO THE GLASS DENS', den: 'LOOK INTO THE DEN' };
/** What each clue told the squad (the journal), in the order of `CLUES`. */
const KNOWN = [
  'Every television in the Dvor is stopped on the same frame: three minutes to twelve.',
  "The butcher's ledger: forty kilos of meat a week on the Institute's account, 'for the bears'.",
  "Institute crates in the garages, stencilled 'Berloga': a bear's den. Delivered last week.",
  "Zina's route sheet for tonight is filled in, every stop, in her own hand.",
  "The museum's plaque: Zarya-12, founded 1962, for the Institute of Chronobiology.",
  "The first New Year tree, 1987. Arkady Zimin, director of the Institute, has been the town's Ded Moroz ever since.",
  'The sleepers in the banya have colour in their faces. It is the cold that holds them, not only the snow.',
  "A new pipe runs from the Institute into the heating plant's chimney. The whole town breathes what comes out of it.",
  'The master clock was stopped by hand: a spanner through it, at three minutes to twelve.',
  "Zimin's notes: the plant would not last the winter. Asleep, they need nothing; asleep, they can wait for spring. He asked nobody.",
  'Under the Institute there are bears asleep behind glass. That is where he learned it.',
  'Danya is in bed forty-one. Two winters, and he has not aged a day.',
  // the Zenit's six photographs (`photos.ts`): their own page in the journal, not a line here
  '', '', '', '', '', '',
  // the store's second floor (`den`, index 18)
  "Behind the toy counter on the second floor, a den of cartons with Kostya's red hat in it. Every Saturday, and Valya on toys pretends not to see him.",
];
const DOLL_AT = ['AT THE FAIR', 'IN THE RYNOK', 'IN THE DVOR'];
const TOOL_NAME = ['SOLDERING IRON', 'SCREWDRIVERS', 'MULTIMETER'];
const CHAIN_AT = ['the depot gate', "the garages' north gate", "the garages' west gate"];
const NUM = ['None', 'One', 'Two', 'Three', 'All four'];
/** The zones that have something to say the first time the squad stands in them. */
const ZONE_BEATS: readonly ZaryaZone[] = ['rynok', 'dvor', 'garages', 'depot', 'dk', 'banya', 'tets', 'institute'];
/** The ones with names, by the tag the director gives each (co-op finds them by it). */
const NAMED: readonly { who: Named; tag: string }[] = [
  { who: 'mishka', tag: 'MISHKA' },
  { who: 'borya', tag: 'BORYA' },
  { who: 'yaga', tag: 'BABA YAGA' },
  { who: 'tamada', tag: 'THE TAMADA' },
  { who: 'morozko', tag: 'MOROZKO' },
];
/** How it ended: the banner, and what the results screen says. */
const ENDINGS: Record<number, readonly [title: string, sub: string, reason: string]> = {
  1: ['HAPPY NEW YEAR', 'Midnight strikes. Nine thousand people breathe out.', 'The whole town wakes'],
  2: ['UNTIL SPRING', 'The heated buildings wake. The square sleeps on under the snow.', 'The heated buildings wake'],
  3: ['WARM', 'He turned the keys himself, in the order they were painted.', 'He turned the keys himself'],
};
/** Line One: the way back is asked for this far west of a stop's door, and a ride is this long in the dark. */
const STOP_BACK = 6;
const RIDE = { arrive: 1, clear: 1.7 };
/** A free-roam town: asleep, every door open. */
const ROAM: StoryView = { ...ZaryaStory.empty(), ch: CH.town, f: F.armed | F.released | F.gena | F.plug };

/** The three rooms built beside the map, and the way into and out of each (the HUD points at these). */
type Room = 'shelter' | 'upstairs' | 'canteen' | 'berloga';
const ROOMS = ZARYA_ZONES.filter((q) => q.id === 'shelter' || q.id === 'upstairs' || q.id === 'canteen' || q.id === 'berloga');
const roomOf = (x: number): Room | null => {
  if (!inInterior(x)) return null;
  for (const q of ROOMS) if (x >= q.x0 && x < q.x1) return q.id as Room;
  return null;
};
const WAY: Record<Room, { in: Spot; out: Spot }> = {
  shelter: { in: ZARYA.stairHead, out: ZARYA.stairFoot },
  // the store's second floor, up the escalator from the hall; the canteen, up the next escalator from the second floor
  upstairs: { in: AT.escalator, out: UPSTAIRS.foot },
  canteen: { in: UPSTAIRS.up, out: CANTEEN.head },
  berloga: { in: INSTITUTE.lift, out: BERLOGA.liftFoot },
};

/** The room each room is entered from (null: the street). */
const ENTERED_FROM: Record<Room, Room | null> = { shelter: null, upstairs: null, canteen: 'upstairs', berloga: null };

const title = (s: string): string => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One line of the HUD's list before it is cut to five. */
interface Row {
  id: string;
  title: string;
  detail: string;
  at: Spot | null;
  done?: boolean;
  locked?: boolean;
  progress?: number;
  /** A side thing: on the map, never tracked. */
  quiet?: boolean;
  label?: string;
  /** Someone being fought: while one is, the compass follows them, however near anything else is. */
  fight?: boolean;
  /** (items) pictures on the row: the parts still missing. */
  icons?: HudIcon[];
}

/** What a prompt is drawn from (`targets`). */
interface Reach {
  out: InteractionTarget[];
  v: StoryView;
  dist: (o: Spot) => number;
  use: (id: string, d: number, text: string, a: StoryAct, o?: { sub?: string; hold?: number; i?: number }) => void;
  note: (id: string, d: number, text: string, sub: string) => void;
}

export class ZaryaRuntime {
  readonly story = new ZaryaStory();
  readonly zones: ZoneSwitch<ZaryaZone>;
  /** Co-op: ask the simulation, which owns the story (`heavy`: what the player holds to swing is a heavy thing). */
  request: ((a: StoryAct, i: number, heavy: boolean) => void) | null = null;
  private readonly director: ZaryaDirector;
  private readonly look = new TownLook();
  // ---- the Zenit's photographs and Morozko's question (`photos.ts`, `weakPoints.ts`) ----
  private readonly photos: ZenitPhotos;
  private readonly question: MorozkoQuestion;
  private active = false;
  private remote = false;
  private wire: StoryView | null = null;
  private prev: StoryView = ZaryaStory.empty();
  private askT = 0;
  private t = 0;
  // what is being said, and what has been
  private readonly queue: Line[] = [];
  private readonly said = new Set<string>();
  private lineT = 0;
  private quiet = 0;
  private wireN = 0;
  private wireT = 30;
  // the time skip in the shelter, a ride on Line One, and the story's last minute
  private skipAt = -1;
  private wakeAt = -1;
  private rideT = -1;
  private rideTo = -1;
  private boardUntil = -1;
  private endT = -1;
  private veil: HTMLDivElement | null = null;
  private black = false;
  private area = 0;
  private roofT = 0;
  private roofed = false;
  /** The last thing this player took off a bench (the next TAKE offers the one after it). */
  private taken = -1;
  /** This player has stood at the door under the Institute. */
  private seenSlots = false;
  /** The prompts being gathered this frame (`targets`). */
  private reachOut: InteractionTarget[] = [];
  /** Kiosks and mods: the shutters, this player's weapon mods, the repair booth (`modsRuntime.ts`). */
  private readonly kiosks: KiosksAndMods;
  /** The people (`people.ts`): who is speaking, who has been met, the sleepers' names. */
  private readonly people: ZaryaPeople;

  constructor(private readonly g: Game) {
    this.zones = new ZoneSwitch(ZARYA_ZONES, g.level.zones);
    this.director = new ZaryaDirector(g.level, g.zombies);
    g.worldRoot.add(this.look.root);
    // (the Zenit's photographs and Morozko's question)
    this.photos = new ZenitPhotos(g, this.look.root);
    this.question = new MorozkoQuestion(g);
    g.interaction.sources.push((t) => this.targets(t));
    g.menus.pauseTab = () => ({ label: 'JOURNAL', build: () => this.journal() });
    g.interaction.boxName = "DED MOROZ'S SACK";
    // kiosks and mods (`modsRuntime.ts`): it plugs this player's mods into the weapons and gates the repair booth
    this.kiosks = new KiosksAndMods(g, (a, i) => this.act(a, i), () => this.view, () => this.active);
    // the people: every line on the wire goes through it (`Game.radioHook`), its name plates hang in the town
    this.people = new ZaryaPeople(g, this.look.root);
    // ---- Ded Moroz's sack moves: after a few openings it turns up somewhere the squad can reach (`zarya/sack.ts`;
    // the box itself is moved by `game/entities.ts`, in co-op by the host), and Kostya says where on the wire ----
    g.entities.mover = {
      every: SACK_EVERY,
      places: SACK_PLACES,
      open: (i) => sackPlaceOpen(this.view, i),
      next: (current, roll) => nextSackPlace(this.view, current, roll),
      moved: (_crate, place, quiet) => {
        const p = SACK_PLACES[place];
        if (quiet || !p) return;
        this.say('sackGone');
        this.queue.push(SACK_MOVED[p.zone]);
      },
    };
    // the sack is drawn taller than a crate (`look.ts`): its prize and its "?" float over the top of it, not inside it;
    // and the sack is the box, so the stock loot crate under it is not drawn (its lid flipped open out of the sack)
    for (const c of g.entities.crates) {
      c.lift = 1;
      c.moved();
      c.model.root.visible = false;
    }
    // ---- end of the sack's block ----
  }

  /** The story as it stands (the simulation's in co-op). */
  get view(): StoryView {
    return this.remote ? (this.wire ?? ZaryaStory.empty()) : this.story.view;
  }

  /** Until Nina's pistols are in hand there is nothing in them: the squad came to find a boy. */
  get unarmed(): boolean {
    return this.active && !ZaryaStory.has(this.view, F.armed);
  }

  /** The forty minutes behind the sealed door have passed on this screen (Nina unlocks her rack after them, not before). */
  private get woken(): boolean {
    return this.skipAt < 0 && this.wakeAt < 0;
  }

  /** What this player carries to swing is a heavy thing (the locks and the glass want one). */
  private get heavy(): boolean {
    // ---- arsenal: any heavy thing carried will do (a player keeps every weapon to swing they take) ----
    return (this.g.melee?.pack ?? []).some((id) => MELEE[id]?.type === 'heavy');
  }

  /** What going through one of the town's doorways is called (`Game.stairwellPrompt`): into the room named `room`, or out of it. Null: the game's own words. */
  wayWords(room: string, into: boolean): string | null {
    // the store's second floor: up from the hall, down from the canteen, down again to the hall
    if (/second floor/i.test(room)) return into && roomOf(this.g.player.x) !== 'canteen' ? 'Up the escalator' : 'Down the escalator';
    if (/canteen/i.test(room)) return into ? 'Up the escalator' : 'Down the escalator';
    if (/berloga/i.test(room)) return into ? 'Down in the freight lift' : 'Up in the freight lift';
    if (/shelter/i.test(room)) return into ? 'Down the staff stairs' : 'Up into the store';
    return null;
  }

  /** A co-op report's row (`encodeStory`). */
  applyWire(row: unknown): void {
    const v = decodeStory(row);
    if (!v) return;
    // joining a run already under way: what was said before is not said again
    if (!this.wire && (v.ch > CH.arrive || v.f !== 0)) this.prev = { ...v };
    this.wire = v;
  }

  private act(a: StoryAct, i = 0): void {
    const p = this.g.player;
    if (this.remote) this.request?.(a, i, this.heavy);
    else this.story.act(a, i, { x: p.x, z: p.z }, this.heavy);
  }

  /**
   * The squad holds its fire on this one (`squad.ts`): someone nothing can hurt yet, or Morozko while he waits for his
   * answer. Solo only: in co-op the simulation's own squad asks the director itself.
   */
  spared(z: Zombie): boolean {
    return this.active && !this.remote && this.director.spared(z);
  }

  /** One of the named ones, while it is up (the director's own solo; by its name in co-op). */
  private named(who: Named): Zombie | null {
    if (!this.remote) return this.director.where(who);
    const tag = NAMED.find((n) => n.who === who)!.tag;
    return this.g.zombies.zombies.find((z) => z.alive && z.tag === tag) ?? null;
  }

  /** A new run (call after `populate`): the town awake, the squad by its van, nothing in their hands. */
  reset(coop: boolean): void {
    const g = this.g;
    this.active = true;
    this.remote = coop;
    this.wire = null;
    this.prev = ZaryaStory.empty();
    this.askT = 0;
    this.t = 0;
    this.queue.length = 0;
    this.said.clear();
    this.lineT = 0;
    this.quiet = 0;
    this.wireN = 0;
    this.wireT = 30;
    this.skipAt = this.wakeAt = this.rideT = this.rideTo = this.boardUntil = this.endT = -1;
    this.taken = -1;
    this.seenSlots = false;
    this.roofT = 0;
    this.roofed = false;
    this.setVeil(0);
    this.story.reset();
    this.kiosks.reset(coop); // kiosks and mods
    if (!coop) {
      this.director.reset();
      g.zombies.spawnAllowed = this.director.spawnAllowed();
      // the town's own kinds of infected, and the fisherman's reel
      g.zombies.pickVariant = zaryaVariantPicker();
      g.zenv.pull = zaryaPull(g.player);
    }
    const inv = g.session.inv;
    inv.slots = [createCarried('pistol'), null];
    inv.activeSlot = 0;
    // ---- arsenal: on ZARYA every gun taken is kept (`economy.addGun`); the cycle is `logic/arsenal.ts` ----
    inv.arsenal = true;
    g.weapons.cancelActions();
    g.session.hunt.status = 'available';
    this.area = 0;
    applyDoors(g.level, this.view);
    this.look.reset();
    // (the Zenit's photographs and Morozko's question)
    this.photos.reset();
    this.question.reset();
    this.people.reset(); // (the people: nobody met yet)
    this.zones.update(g.player.x, g.player.z);
    g.banner('ZARYA-12  //  22:41', "New Year's Eve. A boy has gone missing in the Univermag. The staff door is round the back of the store.", 'info', 7);
  }

  /** The run is over: everything drawn again for the results screen. */
  end(): void {
    this.zones.showAll();
    this.setVeil(0);
    this.active = false;
  }

  // ---------------------------------------------------------------------------------------------
  // every frame
  // ---------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.active) return;
    const g = this.g;
    const p = g.player;
    this.t += dt;
    this.askT = Math.max(0, this.askT - dt);
    const alive = g.playerAlive();
    if (!this.remote) {
      // the story decides when anything hunts: the operation's own boss hunt never begins by itself
      g.session.hunt.status = 'available';
      const stand = [{ x: p.x, z: p.z, up: alive }];
      this.story.step(stand);
      // the first hand in Ded Moroz's sack brings its keeper
      const sv = this.story.view;
      if (sv.ch >= CH.town && !ZaryaStory.has(sv, F.bear) && g.entities.crates.some((c) => c.phase !== 'closed')) this.story.note('bearUp');
      for (const e of this.story.drain()) this.director.onEvent(e, this.story.view, stand, g.rng);
      for (const n of this.director.step(dt, this.story.view, stand, g.rng)) this.story.note(n);
      for (const k of this.director.drainKills()) this.story.kill(k.x, k.z, stand);
    }
    const v = this.view;
    this.react(this.prev, v);
    this.prev = { ...v };
    applyDoors(g.level, v);
    // kiosks and mods: the mods in hand, the parts lying about, a shutter going up
    this.kiosks.update(dt, v, alive, this.remote);

    // ---- the Zenit's photographs (a flash at a marked spot asks for one; a new one is developed and shown) and
    // Morozko's question (its caption, a guard or blow in it asked for as a parry, his weak points drawn) ----
    this.photos.update(dt, v, (i) => this.act('photo', i));
    this.people.update(dt, p); // (the people: a first-meeting card, the sleepers' names near the player)
    this.question.update(dt, v, this.named('morozko'), this.remote ? null : this.director.morozko, () => this.act('parry'));

    // with nothing in their hands there is nothing to raise
    const bare = this.unarmed;
    g.weapons.hidden = bare;
    if (g.melee) g.melee.hidden = bare;
    g.squad.setBare(bare);

    if (alive) {
      this.zones.update(p.x, p.z);
      this.passing(v);
      // the squad keeps together through the stairs
      const area = g.level.floors.areaAt(p.x, p.y, p.z);
      if (area !== this.area) {
        this.area = area;
        g.squad.regroupAt(p.x, p.z, p.yaw, area);
      }
      this.beats(v);
    }
    this.speak(dt, v);
    this.skip(v);
    this.riding(dt);
    // the ones with names wear what the town knew them in (on every screen: the body is the operation's boss underneath)
    for (const n of NAMED) {
      const z = this.named(n.who);
      if (z) this.look.dress(n.who, z);
    }
    // ---- Ded Moroz's sack: the drawn sack stands where the box is (it moves: `zarya/sack.ts`) ----
    const sackBox = g.entities.crates.find((c) => c.cost > 0);
    if (sackBox) this.look.placeSack(sackBox.def.x, sackBox.def.z);
    // ---- end of the sack's block ----
    this.look.update(dt, v, g.renderer.camera.position, this.underRoof(dt), g.renderer.renderer.domElement.clientHeight || 720);
    if (this.endT >= 0) {
      // the last lines are said over a town going dark (or light); then the run is won
      this.endT += dt;
      this.setVeil(Math.min(1, Math.max(0, (this.endT - 4) / 8)));
      if (this.endT >= 9 && this.queue.length === 0 && this.lineT <= 0 && !this.remote && !g.session.ended) g.endRun('victory', ENDINGS[v.end]?.[2] ?? 'Midnight');
    }
  }

  /** Free roam: the whole town drawn, asleep. */
  roam(dt: number): void {
    const g = this.g;
    this.zones.showAll();
    this.setVeil(0);
    this.look.update(dt, ROAM, g.renderer.camera.position, false, g.renderer.renderer.domElement.clientHeight || 720);
  }

  /** No snow falls on the player: in one of the rooms beside the map, in the store, or under any roof the level has. */
  private underRoof(dt: number): boolean {
    const g = this.g;
    const p = g.player;
    if (inInterior(p.x) || inStore(p.x, p.z)) return true;
    this.roofT -= dt;
    if (this.roofT <= 0) {
      this.roofT = 0.3;
      const hit = g.level.world.raycast(p.x, p.eyeY(), p.z, 0, 1, 0, 14, 'shots');
      this.roofed = !!hit && hit.collider?.tag === 'roof';
    }
    return this.roofed;
  }

  /** What is simply picked up in passing: every part but the tree's fuse (that one is a decision), the ornaments, the tools. */
  private passing(v: StoryView): void {
    if (this.askT > 0) return;
    const p = this.g.player;
    const by = (o: Spot): boolean => Math.hypot(o.x - p.x, o.z - p.z) <= PICKUP;
    const take = (a: StoryAct, i: number): void => {
      this.act(a, i);
      if (this.remote) this.askT = 0.4;
    };
    for (let i = 0; i < TOWN.parts.length; i++) if (i !== PART.fuse && by(TOWN.parts[i]!) && ZaryaStory.can(v, 'part', i)) take('part', i);
    for (let i = 0; i < ORNAMENTS.length; i++) if (by(ORNAMENTS[i]!) && ZaryaStory.can(v, 'ornament', i)) take('ornament', i);
    for (let i = 0; i < TOOLS.length; i++) if (by(TOOLS[i]!) && ZaryaStory.can(v, 'tool', i)) take('tool', i);
  }

  /** What changed since the last frame, whoever changed it: the line, the banner, the sound. */
  private react(a: StoryView, b: StoryView): void {
    const g = this.g;
    const rose = (flag: number): boolean => (b.f & flag) !== 0 && (a.f & flag) === 0;
    const did = (flag: number): boolean => (b.g & flag) !== 0 && (a.g & flag) === 0;
    const ping = (): void => void g.audio.play('objective_ping', { priority: 3 });
    const click = (): void => void g.audio.play('upgrade_ok', { priority: 3 });
    /** A warden's key: which, and how many of the four the squad holds now. */
    const key = (i: number): void => {
      const n = ZaryaStory.keys(b).filter(Boolean).length;
      g.banner(`THE ${KEYS[i]} KEY`, n === 1 ? 'One of four. Nobody knows what they are for.' : n === 4 ? 'All four.' : `${NUM[n]} of four.`, 'good', 7);
      ping();
    };
    if (b.ch !== a.ch) {
      if (b.ch === CH.sealed) {
        this.say('sealed');
        ping();
        this.skipAt = this.t + 11;
      } else if (b.ch === CH.ground) {
        this.say('released');
        click();
        g.banner('THE BOLTS DRAW BACK', 'Cold comes down the stairs.', 'info', 4);
      } else if (b.ch === CH.act2 && a.ch < CH.act2) {
        // Line One runs: whoever asked for it is on it
        this.say('left');
        ping();
        const first = this.t <= this.boardUntil;
        this.boardUntil = -1;
        const to = STOPS.findIndex((s) => s.id === 'rynok');
        if (first && to >= 0) this.ride(to, true);
        g.banner('NEXT STOP: RYNOK', 'Line One runs its loop. Ride it on, or back, from any stop it calls at.', 'good', 8);
      }
    }
    if (rose(F.armed)) {
      this.say('armed');
      g.melee?.equip('knife');
      g.melee?.setOut(false);
      g.weapons.redraw();
      g.audio.play('pickup_ammo', { priority: 3 });
      g.feed('SERVICE PISTOL, AND YOUR OWN FOLDING KNIFE', 'good');
    }
    if (rose(F.hall)) this.say('hall');
    if (rose(F.gena)) {
      this.say('genaDown');
      g.banner('THE TOWN IS ASLEEP', 'The ones with frost at their mouths are breathing: nothing you do will hurt them. The ones without are not asleep.', 'info', 9);
    }
    if (rose(F.guard)) this.say('guard');
    if (rose(F.guardDown)) g.feed('THE GUARD IS DOWN  -  THE SHUTTER IS STILL BANGING', 'warn');
    if (rose(F.plug)) {
      this.say('plug');
      click();
      g.feed('THE STORE IS VERY QUIET', 'good');
    }
    if (rose(F.notice)) this.say('notice');
    if (rose(F.flare)) {
      this.look.fire(g.player.x, g.player.z);
      this.say('flare');
      g.banner('A RED STAR OVER THE SQUARE', 'Nine hundred people, standing. Here and there a head turns to look up. Nobody answers it.', 'warn', 9);
      ping();
    }
    if (rose(F.line)) this.say('line');
    if (rose(F.fuseBox)) this.say('fuseBox');
    if (rose(F.handleFit)) {
      this.say('handleFit');
      click();
    }
    if (rose(F.fuseFit)) {
      g.feed('THE LINE FUSE IS IN', 'good');
      click();
    }
    if (rose(F.bear)) {
      this.say('bear');
      g.banner('MISHKA', 'The bear suit is padding from the front. Get behind him, or hang a prize on the slide and he will turn his back.', 'danger', 9);
    }
    if (rose(F.prize)) this.say('prize');
    if (rose(F.bearDown)) {
      this.say('bearDown');
      key(1);
    }

    // ---- what the squad has found, built and cut ----
    const beat: Beat[] = ['tube', 'cartridges', 'handle', 'fuse'];
    TOWN.parts.forEach((part, i) => {
      if (!Unlock.has(b.parts & ~a.parts, i)) return;
      const r = TOWN.recipes.findIndex((q) => q.id === part.recipe);
      const pr = Unlock.progress(TOWN, b, r);
      // (items: the part's picture with the line, and with the banner when it was the last one)
      g.hudEvent({ type: 'feed', text: `${part.name.toUpperCase()}  -  ${TOWN.recipes[r]!.name} ${pr.have}/${pr.need}`, tone: 'good', icon: partIcon(i) });
      g.audio.play('pickup_ammo', { priority: 2, volume: 0.8 });
      if (beat[i]) this.say(beat[i]!);
      if (pr.have !== pr.need || r === RECIPE.line) return;
      if (r === RECIPE.signalka) g.hudEvent({ type: 'banner', title: 'BOTH PARTS FOUND', subtitle: "Signalka: the workbench in the store's maintenance room", tone: 'good', duration: 5, icon: partIcon(i) });
      else g.hudEvent({ type: 'banner', title: 'EVERY PART FOUND', subtitle: `${sentence(SHORT[r]!.toLowerCase())}: ${r >= RECIPE.gvozdomyot ? "Timur's bench in the garages, or the Institute's" : 'any workbench'}`, tone: 'good', duration: 5, icon: partIcon(i) });
    });
    TOWN.recipes.forEach((rec, i) => {
      if (!Unlock.has(b.built & ~a.built, i)) return;
      if (i === RECIPE.line) {
        g.banner('LINE ONE IS LIVE', 'Board when you are ready. Next stop: Rynok.', 'good', 6);
        ping();
        return;
      }
      click();
      if (i === RECIPE.signalka) g.banner('BUILT: THE SIGNALKA', 'A flare pistol. Fire it out on the square.', 'good', 5);
      else if (i === RECIPE.cutters) g.banner('BUILT: BOLT CUTTERS', 'For the chains on the depot gate and the garages.', 'good', 6);
      else g.banner(`BUILT: THE ${SHORT[i]}`, 'It is on the bench. Anyone may take one.', 'good', 6);
      if (rec.id in LINES) this.say(rec.id as Beat);
    });
    TOWN.gates.forEach((gate, i) => {
      if (!Unlock.has(b.gates & ~a.gates, i)) return;
      click();
      g.feed(`THE CHAIN IS CUT  -  ${gate.name}`, 'good');
      if (i === CHAIN.depot) g.feed('LINE ONE CALLS AT THE DEPOT NOW', 'good');
    });

    // ---- Act II and Act III ----
    if (did(G.borya)) {
      this.say('borya');
      g.banner('BORYA', 'Nothing puts him down. Lead him into his cold store, climb out by the hatch, bar the door behind him.', 'danger', 10);
    }
    if (did(G.barred)) {
      this.say('barred');
      click();
      g.feed('THE COLD STORE IS BARRED', 'good');
    }
    if (did(G.cosmoKey)) {
      this.say('cosmoKey');
      key(0);
    }
    if (did(G.tickets)) {
      this.say('tickets');
      g.audio.play('buy_ok', { priority: 3 });
      g.banner('THREE TICKETS', 'The Palace of Culture is open.', 'good', 5);
    }
    if (did(G.yaga)) {
      this.say('yaga');
      g.banner('BABA YAGA', 'Nothing reaches her in the hut. The lever in the wings turns it to face the hall.', 'danger', 9);
    }
    if (did(G.exposed)) {
      click();
      g.feed('THE HUT TURNS', 'warn');
    }
    if (did(G.yagaDown)) {
      this.say('yagaDown');
      key(2);
    }
    if (did(G.escalator)) {
      this.say('escalator');
      click();
      g.feed('THE PADLOCK BREAKS  -  THE ESCALATOR IS OPEN', 'good');
    }
    if (did(G.tamada)) {
      this.say('tamada');
      g.banner('THE TAMADA', "While he has a microphone, every toast brings them to their feet. Pull his three loudspeakers' plugs.", 'danger', 9);
    }
    if (did(G.tamadaDown)) {
      this.say('tamadaDown');
      key(3);
    }
    if (did(G.fireBoard)) {
      click();
      g.feed('THE LOCK BREAKS  -  A FIRE AXE', 'good');
    }
    if (did(G.sickleCase)) {
      click();
      g.feed('THE GLASS BREAKS  -  A SICKLE AND A HAMMER', 'good');
    }
    if (did(G.hung)) {
      this.say('hung');
      ping();
      g.banner('THE TREE IS WHOLE', "The museum guard's cabinet stands open.", 'good', 6);
    }
    if (did(G.pond)) {
      this.say('pond');
      ping();
      g.banner('THE POND ROAD GATE GIVES', 'Beyond the depot: the banya, the pond, the heating plant. Line One calls there now.', 'good', 8);
    }
    if (did(G.code)) {
      this.say('code');
      click();
      g.feed('THE CHECKPOINT OPENS', 'good');
    }
    if (did(G.keyDoor)) {
      this.say('keyDoor');
      ping();
      g.feed('FOUR KEYS TURN  -  THE DOOR OPENS', 'good');
    }
    if (did(G.asked)) this.say('asked');
    if (did(G.answered)) {
      const believed = (b.g & G.believed) !== 0;
      this.say(believed ? 'believed' : 'doubted');
      if (believed) g.banner('HE BELIEVES YOU', 'Give him the four keys, at the console.', 'good', 8);
      else g.banner('MOROZKO', 'He does not believe it. Everything the squad found out about him is a weak point.', 'danger', 9);
    }
    if (did(G.morozkoDown)) {
      this.say('morozkoDown');
      g.banner('THE PURGE CONSOLE', 'Four switches, four keys. The order matters.', 'info', 8);
    }

    // ---- the counted things ----
    const n = ZaryaStory.count;
    for (let i = 0; i < CLUES.length; i++) {
      if ((b.clues & ~a.clues & (1 << i)) === 0) continue;
      const id = CLUES[i]!.id;
      if (id in LINES) this.say(id as Beat);
      g.audio.play('pickup_ammo', { priority: 2, volume: 0.6 });
    }
    if (b.covered !== a.covered && n(b.covered) > n(a.covered)) {
      const c = n(b.covered);
      g.feed(`COVERED  -  ${c} ${c === 1 ? 'SLEEPER' : 'SLEEPERS'}`, 'good');
      if ((b.covered & ~a.covered & 2) !== 0) this.say('babushka');
    }
    if (n(b.orn) > n(a.orn)) {
      const c = n(b.orn);
      g.audio.play('pickup_ammo', { priority: 2, volume: 0.8 });
      // (items: the picture of the ornament just found)
      const oi = ORNAMENTS.findIndex((_, k) => (b.orn & ~a.orn & (1 << k)) !== 0);
      g.hudEvent({ type: 'feed', text: `GLASS ORNAMENT  -  ${c} OF ${ORNAMENTS.length}`, tone: 'good', icon: oi >= 0 ? ornamentIcon(oi) : undefined });
      if (c === ORNAMENTS.length) g.hudEvent({ type: 'banner', title: 'SIX GLASS ORNAMENTS', subtitle: 'They came off the town tree.', tone: 'good', duration: 5, icon: oi >= 0 ? ornamentIcon(oi) : undefined });
    }
    DOLLS.forEach((_, i) => {
      const s = ZaryaStory.shells(b, i);
      if (s <= ZaryaStory.shells(a, i)) return;
      this.say('doll');
      click();
      g.feed(`THE MATRYOSHKA ${DOLL_AT[i]}  -  ${s} OF ${STORY.dollShells} SHELLS OPEN`, 'good');
    });
    const plugs = n(b.m & 7);
    if (plugs > n(a.m & 7)) {
      click();
      g.feed(`LOUDSPEAKER UNPLUGGED  -  ${plugs} OF 3`, 'good');
    }
    const valves = n((b.m >> 3) & 7);
    if (valves > n((a.m >> 3) & 7)) {
      click();
      g.feed(`VALVE TURNED  -  ${valves} OF 3`, 'good');
      if (valves === 3) this.say('valves');
    }
    for (let i = 0; i < TOOLS.length; i++) {
      if ((b.m & ~a.m & (1 << (6 + i))) === 0) continue;
      g.audio.play('pickup_ammo', { priority: 2, volume: 0.8 });
      g.hudEvent({ type: 'feed', text: `${TOOL_NAME[i]}  -  THE REPAIRMAN'S TOOLS ${n((b.m >> 6) & 7)} OF 3`, tone: 'good', icon: toolIcon(i) }); // (items: its picture)
    }
    if (b.turned !== a.turned && b.turned > 0) {
      click();
      g.feed(`THE ${KEYS[(b.turned % 10) - 1]} KEY TURNS  -  ${String(b.turned).length} OF 4`, 'good');
    }
    if (b.end !== 0 && a.end === 0) {
      const e = ENDINGS[b.end] ?? ENDINGS[2]!;
      this.endT = 0;
      this.say(b.end === 1 ? 'end1' : b.end === 3 ? 'end3' : 'end2');
      g.banner(e[0], e[1], 'good', 14);
      ping();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // what is said
  // ---------------------------------------------------------------------------------------------

  private say(beat: Beat): void {
    if (this.said.has(beat)) return;
    this.said.add(beat);
    this.queue.push(...LINES[beat]);
  }

  /** The lines that belong to a place rather than to something done. */
  private beats(v: StoryView): void {
    const p = this.g.player;
    const near = (o: Spot, r: number): boolean => Math.hypot(o.x - p.x, o.z - p.z) < r;
    if (v.ch === CH.arrive) {
      if (this.t > 3) this.say('arrive');
      // ---- co-op squad: the extra players are volunteers who came out with Timur and Vera tonight (`lines.ts` crew) ----
      if (this.t > 3 && this.remote) {
        const players = this.g.coop.room.room?.players.length ?? 1;
        if (players >= 3) this.say('crewFive');
        else if (players === 2) this.say('crewFour');
      }
      if (near(ZARYA.laneDoor, 9)) this.say('door');
      if (inShelter(p.x) && p.x > ZARYA.stairFoot.x + 2) this.say('shelter');
      return;
    }
    if (v.ch >= CH.town && near(ZARYA.sack, 7)) this.say('sack');
    if (v.ch < CH.act2 || this.black) return;
    // a zone's own, the first time the squad stands in it
    const zone = this.zones.current;
    if (zone && ZONE_BEATS.includes(zone)) this.say(zone as Beat);
    // the keypad, before anyone has read the year off the museum's plaque
    if (ZaryaStory.did(v, G.pond) && !ZaryaStory.did(v, G.code) && (v.clues & (1 << CLUE.plaque)) === 0 && near(TETS.keypad, STORY.reach)) this.say('codeUnknown');
    if (roomOf(p.x) === 'berloga') this.seenSlots = true;
  }

  private speak(dt: number, v: StoryView): void {
    const g = this.g;
    const p = g.player;
    this.lineT -= dt;
    if (this.lineT <= 0 && this.queue.length) {
      const [who, text] = this.queue.shift()!;
      const secs = lineSeconds(text);
      g.radio(who, text, secs);
      this.lineT = secs + 0.3;
      this.quiet = 0;
      return;
    }
    if (this.queue.length || this.lineT > 0) return;
    // Nina on the wire, when nothing else is being said: she tells the squad who people are
    this.quiet += dt;
    this.wireT -= dt;
    if (v.ch >= CH.town && v.ch < CH.ended && this.endT < 0 && this.quiet > 8 && this.wireT <= 0 && this.wireN < NINA_WIRE.length && onSquare(p.x, p.z) && ZaryaStory.has(v, F.flare)) {
      this.wireT = 55;
      this.queue.push(['NINA', NINA_WIRE[this.wireN++]!]);
    }
  }

  /** In the shelter, after the door seals: black for a breath, and it is forty minutes later. */
  private skip(v: StoryView): void {
    const g = this.g;
    if (this.endT >= 0) return;
    if (this.skipAt >= 0 && v.ch !== CH.sealed) {
      // someone else has opened the door already (co-op): no dark for this screen, but what was said on waking is still owed
      this.skipAt = -1;
      g.banner('00:41', 'By a phone. Every clock in the room says 23:57, and said it when the lamp came on.', 'info', 7);
      this.say('wake');
    }
    if (this.skipAt >= 0 && this.t >= this.skipAt && this.queue.length === 0 && this.lineT <= 0 && this.rideT < 0) {
      this.skipAt = -1;
      this.wakeAt = this.t + 2.6;
      this.setVeil(1);
    }
    if (this.wakeAt >= 0 && this.t >= this.wakeAt) {
      this.wakeAt = -1;
      this.setVeil(0);
      g.banner('00:41', 'By a phone. Every clock in the room says 23:57, and said it when the lamp came on.', 'info', 7);
      this.say('wake');
    }
  }

  private setVeil(k: number): void {
    this.black = k > 0;
    if (k <= 0 && !this.veil) return;
    if (!this.veil) {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;background:#000;transition:opacity .9s';
      const c = this.g.renderer.renderer.domElement;
      if (c.parentElement) c.parentElement.insertBefore(d, c.nextSibling);
      else document.body.appendChild(d);
      this.veil = d;
    }
    this.veil.style.opacity = String(Math.max(0, Math.min(1, k)));
  }

  // ---------------------------------------------------------------------------------------------
  // Line One
  // ---------------------------------------------------------------------------------------------

  /** The next stop the tram calls at after stop `i`, the way it drives (`dir` 1) or the way back (-1); -1 when there is no other. */
  private nextStop(v: StoryView, i: number, dir: 1 | -1): number {
    const n = STOPS.length;
    for (let k = 1; k < n; k++) {
      const j = (i + dir * k + n * k) % n;
      if (ZaryaStory.stopOpen(v, STOPS[j]!.opens)) return j;
    }
    return -1;
  }

  /** Board for stop `to`: the screen goes black for a breath, and the squad steps down there. Never while it is black already. */
  private ride(to: number, first = false): void {
    if (this.black || this.rideT >= 0 || !STOPS[to]) return;
    this.rideT = 0;
    this.rideTo = to;
    this.setVeil(1);
    this.g.audio.play('step_concrete', { priority: 1, volume: 0.7 });
    // Zina calls every stop (the first ride's is in the script already)
    if (first) return;
    const line: Line = ['ZINA', `Next stop. ${title(STOPS[to]!.name)}.`];
    const last = this.queue[this.queue.length - 1];
    if (last && last[0] === 'ZINA') this.queue[this.queue.length - 1] = line;
    else this.queue.push(line);
  }

  private riding(dt: number): void {
    if (this.rideT < 0) return;
    const g = this.g;
    this.rideT += dt;
    const stop = STOPS[this.rideTo];
    if (stop && this.rideT >= RIDE.arrive) {
      // out of the car's doors, facing away from the car (act-2 polish: Stroiteley Street's doors are on the north
      // side, where facing south had the squad step off nose to the tram's flank)
      this.rideTo = -1;
      const away = stop.door.z > stop.z ? Math.PI : 0;
      g.player.teleport(stop.door.x, stop.door.z, away);
      this.area = g.level.floors.areaAt(stop.door.x, 0, stop.door.z);
      g.squad.regroupAt(stop.door.x, stop.door.z, away, this.area);
      this.zones.update(stop.door.x, stop.door.z);
    }
    if (this.rideT >= RIDE.clear) {
      this.rideT = -1;
      if (this.endT < 0) this.setVeil(0);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // what can be used
  // ---------------------------------------------------------------------------------------------

  private targets(out: InteractionTarget[]): void {
    if (!this.active || this.endT >= 0 || this.black) return;
    const p = this.g.player;
    this.reachOut = out;
    const q: Reach = {
      out,
      v: this.view,
      dist: (o) => Math.hypot(o.x - p.x, o.z - p.z),
      use: (id, d, text, a, o = {}) => void out.push({ id: `zy-${id}`, dist: d, text, sub: o.sub, tone: 'good', hold: o.hold ?? 0, enabled: true, onUse: () => this.act(a, o.i ?? 0) }),
      note: (id, d, text, sub) => void out.push({ id: `zy-${id}`, dist: d, text, sub, tone: 'warn', hold: 0, enabled: false, onUse: () => {} }),
    };
    const room = roomOf(p.x);
    if (room === 'shelter') this.inShelter(q);
    else if (room === 'canteen') this.inCanteen(q);
    else if (room === 'upstairs') {
      // the store's second floor has nothing of its own to prompt: its den is `seen`, its ornament picked up `passing`
    }
    else if (room === 'berloga') this.inBerloga(q);
    else {
      this.inStoreAndSquare(q);
      if (q.v.ch >= CH.act2) this.inTown(q);
      this.kiosks.targets(out, q.v); // kiosks and mods: BUY THE SHUTTER, FIT A MOD at a bench
      this.atStops(q);
    }
    if (room !== 'shelter') this.seen(q);
  }

  private inShelter({ v, dist, use, note }: Reach): void {
    const R = STORY.reach;
    const dr = dist(AT.arm);
    if (dr <= R && ZaryaStory.can(v, 'arm')) {
      if (this.woken) use('arm', dr, 'TAKE A PISTOL', 'arm', { sub: "Nina's rack: one for each shift" });
      else note('arm', dr, "NINA'S RACK", 'Locked. She has the key, and the kettle on');
    }
    const dl = dist(AT.release);
    if (dl <= R && v.ch === CH.sealed) {
      if (ZaryaStory.can(v, 'release')) use('release', dl, 'PULL THE MANUAL RELEASE', 'release', { hold: 1.5 });
      else note('release', dl, 'MANUAL RELEASE', 'Nina has something for you first, in the watch room');
    }
    const dd = dist(ZARYA.blastDoor);
    if (dd <= R && v.ch === CH.sealed && dl > R) note('door', dd, 'SEALED', 'The bolts have driven in twice. There is a manual release by the door');
  }

  /** The canteen: the Tamada's three plugs, and his camera once he is down. */
  private inCanteen({ v, dist, use }: Reach): void {
    const R = STORY.reach;
    CANTEEN.plugs.forEach((plug, i) => {
      const d = dist(plug);
      if (d <= R && ZaryaStory.can(v, 'unplug', i)) use(`unplug-${i}`, d, 'PULL THE PLUG', 'unplug', { sub: `His loudspeakers: ${ZaryaStory.count(v.m & 7)} of 3 are out`, hold: 0.8, i });
    });
    const dz = dist(CANTEEN.tamada);
    if (dz <= R && ZaryaStory.did(v, G.tamadaDown)) this.take('zenit', dz, 'TAKE THE ZENIT', { gun: 'zenit' }, 'His camera, and its flash');
  }

  /** The hall under the Institute: the door's four slots, Morozko's question, the console's four keys. */
  private inBerloga({ v, dist, use, note }: Reach): void {
    const R = STORY.reach;
    const did = (flag: number): boolean => ZaryaStory.did(v, flag);
    const ds = dist(AT.slots);
    if (ds <= R && !did(G.keyDoor)) {
      if (ZaryaStory.can(v, 'slots')) use('slots', ds, 'FIT THE FOUR KEYS', 'slots', { sub: 'Cosmonaut, sun, wheat, dove', hold: 1.5 });
      else {
        const missing = KEYS.filter((_, i) => !ZaryaStory.keys(v)[i]).map((k) => k.toLowerCase());
        note('slots', ds, 'FOUR KEY SLOTS', `Missing: the ${missing.join(', the ')}`);
      }
    }
    const dm = dist(BERLOGA.morozko);
    if (dm <= R + 3 && ZaryaStory.can(v, 'answer')) use('answer', dm, 'ANSWER: WARM, DEDUSHKA', 'answer', { hold: 0.6 });
    const believed = did(G.believed);
    BERLOGA.keys.forEach((at, i) => {
      const d = dist(at);
      if (d > R * 0.6 || !ZaryaStory.can(v, 'turn', i)) return;
      const n = v.turned > 0 ? String(v.turned).length : 0;
      // believed, he turns them himself: the squad only hands them over
      if (believed) use(`turn-${i}`, d, `GIVE HIM THE ${KEYS[i]} KEY`, 'turn', { sub: `${n} of 4 given`, hold: 0.6, i });
      else use(`turn-${i}`, d, `TURN THE ${KEYS[i]} KEY`, 'turn', { sub: `${n} of 4 turned. The order matters`, hold: 0.8, i });
    });
  }

  /** The store and the square: Act I's things, which stay where they are for the whole story. */
  private inStoreAndSquare({ out, v, dist, use, note }: Reach): void {
    const g = this.g;
    const p = g.player;
    const R = STORY.reach;
    const has = (flag: number): boolean => ZaryaStory.has(v, flag);
    const dp = dist(AT.plug);
    if (dp <= R && ZaryaStory.can(v, 'plug')) use('plug', dp, 'PULL THE PLUG', 'plug', { sub: "The shutter's motor", hold: 1 });
    const dn = dist(AT.notice);
    if (dn <= R && ZaryaStory.can(v, 'notice')) use('notice', dn, 'READ THE NOTICEBOARD', 'notice');
    if (v.ch >= CH.ground) {
      this.benches({ out, v, dist, use, note });
      TOWN.offers.forEach((o, i) => this.buy(out, Math.hypot(ZARYA.sports.x - 3 + i * 2 - p.x, ZARYA.sports.z + 0.4 - p.z), o, R * 0.6));
      for (const f of TOWN.finds) {
        const d = dist(f);
        if (d <= R * 0.75) this.take(`find-${f.id}`, d, `TAKE ${f.name}`, f.gives);
      }
    }

    // the square: the fuse in the tree's box, the Signalka, the hook on the slide
    const fuse = TOWN.parts[PART.fuse]!;
    const df = dist(fuse);
    if (df <= R && ZaryaStory.can(v, 'part', PART.fuse)) use('fuse', df, 'TAKE THE FUSE', 'part', { sub: "The tree's lights run off it", hold: 1.2, i: PART.fuse });
    if (ZaryaStory.can(v, 'flare') && onSquare(p.x, p.z)) use('flare', 2.4, 'FIRE THE SIGNALKA', 'flare', { hold: 0.6 });
    const dh = dist(AT.prize);
    if (dh <= R + 1 && ZaryaStory.can(v, 'prize')) use('prize', dh, 'HANG A PRIZE ON THE HOOK', 'prize', { sub: 'He will come to see to it', hold: 0.8 });

    // tram No. 1 before it runs: the cab, the stop's fuse box, the doors
    if (v.ch !== CH.town) return;
    const dc = dist(AT.line);
    if (dc <= R + 1) {
      if (ZaryaStory.can(v, 'line')) use('cab', dc, 'LOOK IN THE CAB', 'line');
      else if (ZaryaStory.can(v, 'fitHandle')) use('cab', dc, 'GIVE ZINA HER HANDLE', 'fitHandle', { hold: 1 });
      else if (has(F.line) && !has(F.handleFit)) note('cab', dc, 'THE CAB', 'Her handle is where she takes her tea: the Univermag');
    }
    const dx = dist(AT.fusebox);
    if (dx <= R) {
      if (ZaryaStory.can(v, 'fusebox')) use('box', dx, 'OPEN THE FUSE BOX', 'fusebox');
      else if (ZaryaStory.can(v, 'fitFuse')) use('box', dx, 'FIT THE LINE FUSE', 'fitFuse', { hold: 1 });
      else if (has(F.fuseBox) && !has(F.fuseFit)) note('box', dx, 'FUSE BOX', 'Empty. The tree runs off the spare');
    }
    const dt = dist(AT.board);
    if (dt <= R + 2 && dc > R + 1) {
      if (ZaryaStory.can(v, 'board')) {
        out.push({
          id: 'zy-board',
          dist: dt,
          text: 'BOARD THE TRAM',
          sub: 'Next stop: Rynok',
          tone: 'good',
          hold: 1.4,
          enabled: true,
          onUse: () => {
            this.boardUntil = this.t + 3;
            this.act('board');
          },
        });
      } else if (has(F.line)) note('board', dt, 'TRAM No. 1', `${has(F.handleFit) ? '' : 'No handle. '}${has(F.fuseFit) ? '' : 'No line fuse.'}`.trim());
    }
  }

  /** A workbench: build what the parts are there for (the strong ones only at a proper bench), or take what is built. */
  private benches({ v, dist, use, note }: Reach): void {
    const R = STORY.reach;
    for (const bench of BENCHES) {
      const d = dist(bench.at);
      if (d > R) continue;
      const ready = TOWN.recipes.map((_, r) => r).filter((r) => ZaryaStory.can(v, 'build', r));
      const here = ready.find((r) => bench.main || r < RECIPE.gvozdomyot);
      if (here !== undefined) {
        use('build', d, `BUILD THE ${SHORT[here]}`, 'build', { sub: here === RECIPE.signalka ? 'Both parts found' : 'Every part found', hold: 1.4, i: here });
        return;
      }
      // the strong ones want a proper bench, and a lesser one says so
      if (ready.length) {
        note('bench', d, 'WORKBENCH', `The ${SHORT[ready[0]!]!.toLowerCase()} wants a proper bench: Timur's, in the garages`);
        return;
      }
      // what is built lies on every bench: each player takes their own (one after another, if there are several)
      const made = TOWN.recipes.map((_, r) => r).filter((r) => Unlock.has(v.built, r) && !('tool' in TOWN.recipes[r]!.gives) && !this.holds(TOWN.recipes[r]!.gives));
      if (made.length) {
        const r = made.find((k) => k > this.taken) ?? made[0]!;
        this.take(`made-${r}`, d, `TAKE THE ${SHORT[r]}`, TOWN.recipes[r]!.gives, undefined, () => (this.taken = r));
        return;
      }
      // nothing to do here yet: how far along the nearest thing is
      let best = -1;
      let left = 99;
      TOWN.recipes.forEach((_, r) => {
        if (r === RECIPE.line || Unlock.has(v.built, r)) return;
        const pr = Unlock.progress(TOWN, v, r);
        if ((pr.have > 0 || r === RECIPE.signalka) && pr.need - pr.have < left) {
          left = pr.need - pr.have;
          best = r;
        }
      });
      if (best >= 0) {
        const pr = Unlock.progress(TOWN, v, best);
        note('bench', d, 'WORKBENCH', `${sentence(SHORT[best]!.toLowerCase())}: ${pr.have} of ${pr.need} parts`);
      }
      return;
    }
  }

  /** Everything past the square, on the street map: Acts II and III. */
  private inTown({ out, v, dist, use, note }: Reach): void {
    const g = this.g;
    const p = g.player;
    const R = STORY.reach;
    const did = (flag: number): boolean => ZaryaStory.did(v, flag);
    const heavy = this.heavy;
    const WANTS = 'It wants something heavy to swing';

    // ---- the gates ----
    TOWN.gates.forEach((gate, i) => {
      if (Unlock.has(v.gates, i)) return;
      const at = ZaryaStory.where('cut', i);
      if (!at) return;
      const d = dist(at);
      if (d > R + 3) return;
      if (ZaryaStory.can(v, 'cut', i)) use(`cut-${i}`, d, gate.verb, 'cut', { sub: title(gate.name), hold: gate.hold, i });
      else {
        const pr = Unlock.progress(TOWN, v, RECIPE.cutters);
        note(`cut-${i}`, d, 'CHAINED SHUT', pr.have === pr.need ? 'The bolt cutters are still in pieces: any workbench' : pr.have > 0 ? `Bolt cutters would do it: ${pr.have} of ${pr.need} parts` : 'Bolt cutters would do it');
      }
    });
    const gateAt = (id: string): Spot | undefined => GATES.find((q) => q.id === id);
    const dk = gateAt('palace');
    const dtk = dist(AT.tickets);
    if (dtk <= R && ZaryaStory.can(v, 'tickets')) {
      const cash = g.session.inv.cash;
      const ok = cash >= STORY.tickets;
      out.push({
        id: 'zy-tickets',
        dist: dtk,
        text: `BUY THREE TICKETS  $${STORY.tickets}`,
        sub: ok ? 'The New Year pageant. One pays for the squad' : `You have $${cash}`,
        tone: ok ? 'good' : 'warn',
        hold: 0.8,
        enabled: ok,
        onUse: () => {
          // the buyer's own points, then the act
          if (!ZaryaStory.can(this.view, 'tickets') || g.session.inv.cash < STORY.tickets) return;
          g.session.inv.cash -= STORY.tickets;
          this.act('tickets');
        },
      });
    } else if (dk && !did(G.tickets) && dist(dk) <= R + 2) note('palace', dist(dk), 'THE PALACE DOORS', 'Tickets only tonight. The box office is beside them');
    const pond = gateAt('pond');
    if (pond && !did(G.pond) && dist(pond) <= R + 3) {
      const open = DOLLS.filter((_, i) => ZaryaStory.shells(v, i) >= STORY.dollShells).length;
      note('pond', dist(pond), 'FROZEN SHUT', v.dolls > 0 ? `It gives when the three painted dolls stand open: ${open} of 3` : 'Iced solid since November. No tool will shift it');
    }
    const dc = dist(AT.code);
    if (dc <= R && did(G.pond) && !did(G.code)) {
      if (ZaryaStory.can(v, 'code')) use('code', dc, 'ENTER 1962', 'code', { sub: "The year on the museum's plaque", hold: 1 });
      else note('code', dc, 'THE KEYPAD', 'Four digits, and nobody knows them');
    }
    const de = dist(AT.escalator);
    if (de <= R && ZaryaStory.can(v, 'escalator')) {
      if (heavy) use('escalator', de, 'BREAK THE PADLOCK', 'escalator', { sub: 'The escalator', hold: 1 });
      else note('escalator', de, 'PADLOCKED', WANTS);
    }

    // ---- the Rynok: Borya's cold store, the police post ----
    const db = dist(AT.bar);
    if (db <= R && !did(G.barred)) {
      if (ZaryaStory.can(v, 'bar')) use('bar', db, 'BAR THE DOOR', 'bar', { sub: 'He is inside', hold: 1 });
      else if (did(G.borya)) note('bar', db, 'THE COLD STORE DOOR', 'He has to be inside it first');
    }
    const dkey = dist(AT.cosmoKey);
    if (dkey <= R && ZaryaStory.can(v, 'cosmoKey')) use('cosmo', dkey, 'TAKE HIS KEYS', 'cosmoKey', { sub: 'On the hook' });
    const dh = dist(RYNOK.hatchIn);
    if (dh <= R && inRect(RYNOK.coldStore, p.x, p.z)) {
      out.push({
        id: 'zy-hatch',
        dist: dh,
        text: 'CLIMB OUT THE HATCH',
        sub: 'He does not fit through it',
        tone: 'good',
        hold: 0.5,
        enabled: true,
        onUse: () => {
          const to = RYNOK.hatch;
          const yaw = Math.atan2(-(to.x - RYNOK.hatchIn.x), -(to.z - RYNOK.hatchIn.z));
          g.fadeThroughBlack(0.35);
          p.teleport(to.x, to.z, yaw);
          g.squad.regroupAt(to.x, to.z, yaw, g.level.floors.areaAt(to.x, 0, to.z));
          g.audio.play('step_concrete', { priority: 1, volume: 0.7 });
        },
      });
    }
    // one rifle on the rack, a step along the counter from the game's own ammunition
    const side = { x: RYNOK.police.x + Math.cos(RYNOK.policeYaw) * 1.6, z: RYNOK.police.z - Math.sin(RYNOK.policeYaw) * 1.6 };
    for (const o of POLICE) this.buy(out, dist(side), o, 1.5);
    OKHOTNIK.forEach((o, i) => this.buy(out, Math.hypot(DEPOT.shop.x - 1.1 + i * 2.2 - p.x, DEPOT.shop.z - p.z), o, R * 0.6));

    // ---- things that want a heavy blow, and what is behind them ----
    const df = dist(AT.fireBoard);
    if (df <= R) {
      if (did(G.fireBoard)) this.take('axe', df, 'TAKE THE FIRE AXE', { melee: 'fireAxe' });
      else if (ZaryaStory.can(v, 'fireBoard')) {
        if (heavy) use('board-lock', df, 'BREAK THE LOCK', 'fireBoard', { sub: 'The fire board', hold: 1 });
        else note('board-lock', df, 'THE FIRE BOARD', `Padlocked. ${WANTS}`);
      }
    }
    const dsc = dist(AT.sickleCase);
    if (dsc <= R) {
      if (did(G.sickleCase)) this.take('serp', dsc, 'TAKE THE SERP AND MOLOT', { melee: 'serpMolot' });
      else if (ZaryaStory.can(v, 'sickleCase')) {
        if (heavy) use('case', dsc, 'BREAK THE GLASS', 'sickleCase', { sub: 'A sickle and a hammer', hold: 1 });
        else note('case', dsc, 'THE MUSEUM CASE', `Thick glass. ${WANTS}`);
      }
    }
    const dcab = dist(AT.cabinet);
    if (dcab <= R && did(G.tickets)) {
      if (did(G.hung)) this.take('shashka', dcab, 'TAKE THE SHASHKA', { melee: 'shashka' });
      else note('cabinet', dcab, "THE GUARD'S CABINET", "Locked. A card: 'Opened when the town tree is whole at midnight'");
    }
    const dhang = dist(AT.hang);
    if (dhang <= R) {
      if (ZaryaStory.can(v, 'hang')) use('hang', dhang, 'HANG THE ORNAMENTS', 'hang', { sub: 'All six, back on the town tree', hold: 1.5 });
      else if (!did(G.hung) && v.orn !== 0) note('hang', dhang, 'THE TOWN TREE', `${ZaryaStory.count(v.orn)} of ${ORNAMENTS.length} of its glass ornaments found`);
    }

    // ---- the Palace's stage, the plant, the banya ----
    const dl = dist(AT.lever);
    if (dl <= R && ZaryaStory.can(v, 'lever')) use('lever', dl, 'PULL THE LEVER', 'lever', { sub: 'The revolve turns her hut', hold: 0.8 });
    TETS.valves.forEach((at, i) => {
      const d = dist(at);
      if (d <= R && ZaryaStory.can(v, 'valve', i)) use(`valve-${i}`, d, 'TURN THE VALVE WHEEL', 'valve', { sub: `${ZaryaStory.count((v.m >> 3) & 7)} of 3 turned`, hold: 1.5, i });
    });
    const dsteam = dist(BANYA.steam);
    if (dsteam <= R) {
      out.push({
        id: 'zy-steam',
        dist: dsteam,
        text: 'SIT IN THE STEAM',
        sub: 'The one warm room in town',
        tone: 'good',
        hold: 2,
        enabled: true,
        onUse: () => {
          g.session.vitals.health = Math.max(g.session.vitals.health, PLAYER.maxHealth);
          g.audio.play('upgrade_ok', { priority: 2 });
          g.feed('WARM THROUGH', 'good');
        },
      });
    }
  }

  /** Line One: at every stop it calls at, on to the next from the car's door, back to the last from a few steps west. */
  private atStops({ out, v, dist }: Reach): void {
    if (v.ch < CH.act2) return;
    const R = STORY.reach;
    STOPS.forEach((s, i) => {
      if (!ZaryaStory.stopOpen(v, s.opens)) return;
      const way = (id: string, d: number, to: number, text: string): void => {
        if (d > R || to < 0) return;
        out.push({ id: `zy-${id}-${i}`, dist: d, text: `${text} ${STOPS[to]!.name}`, sub: 'Line One', tone: 'good', hold: 0.8, enabled: true, onUse: () => this.ride(to) });
      };
      way('ride', dist(s.door), this.nextStop(v, i, 1), 'RIDE ON TO');
      way('back', dist({ x: s.door.x - STOP_BACK, z: s.door.z }), this.nextStop(v, i, -1), 'RIDE BACK TO');
    });
  }

  /** What there is to notice, and who there is to cover: anywhere but the shelter. */
  private seen({ v, dist, use }: Reach): void {
    const R = STORY.reach;
    let clue = false;
    CLUES.forEach((c, i) => {
      const d = dist(c.at);
      if (d > R || !ZaryaStory.can(v, 'clue', i)) return;
      clue = true;
      use(`clue-${c.id}`, d, CLUE_VERB[c.id] ?? `${READ.has(c.id) ? 'READ' : 'LOOK AT'} ${c.name}`, 'clue', { i });
    });
    // one thing at a time: a sleeper is covered once what is beside them has been looked at
    if (clue) return;
    COVERS.forEach((at, i) => {
      const d = dist(at);
      if (d > R || !ZaryaStory.can(v, 'cover', i)) return;
      const her = i < 2 || (i !== COVERS.length - 1 && (i * 7 + 3) % 2 === 0);
      // a step behind anything else in reach: the story's own things come first
      use(`cover-${i}`, d + 0.5, her ? 'COVER HER' : 'COVER HIM', 'cover', { sub: 'Against the cold', hold: 0.8, i });
    });
  }

  /** This player carries it already. */
  private holds(what: Gives): boolean {
    const g = this.g;
    // ---- arsenal: everything taken is carried, not only what is in hand ----
    if ('melee' in what) return g.melee?.pack.includes(what.melee) ?? false;
    if ('gun' in what) return g.session.inv.slots.some((s) => s?.id === what.gun);
    return true;
  }

  /**
   * ---- arsenal: a gun carried already is taken again for its ammunition. Null: not a carried gun; otherwise whether
   * its ammunition is full (nothing to take). ----
   */
  private topUp(what: Gives): boolean | null {
    if (!('gun' in what)) return null;
    const inv = this.g.session.inv;
    const at = slotOf(inv, what.gun);
    return at < 0 ? null : isFull(inv.slots[at]!.ammo);
  }

  /** What taking it would put down (nothing while a hand is free). */
  private swaps(what: Gives): string | undefined {
    const g = this.g;
    if (g.session.inv.arsenal) return undefined; // (arsenal: nothing is ever put down)
    if ('melee' in what) {
      const id = g.melee?.carried;
      return id ? `Instead of your ${MELEE[id]?.name.toLowerCase() ?? 'own'}` : undefined;
    }
    if ('gun' in what) {
      const inv = g.session.inv;
      if (inv.slots[0] === null || inv.slots[1] === null) return undefined;
      const cur = inv.slots[inv.activeSlot];
      return cur ? `Instead of your ${WEAPONS[cur.id]?.name ?? 'gun'}` : undefined;
    }
    return undefined;
  }

  /** Something lying there to be taken, as often as anyone likes. */
  private take(id: string, d: number, text: string, what: Gives, sub?: string, then?: () => void): void {
    // ---- arsenal: a gun carried already can be taken again for its ammunition ----
    const full = this.topUp(what);
    const owned = this.holds(what) && full !== false;
    this.reachOut.push({
      id: `zy-${id}`,
      dist: d,
      text,
      sub: full === false ? 'More ammunition for yours' : owned ? (full ? 'Carried, and its ammunition is full' : 'Carried already') : (this.swaps(what) ?? sub),
      tone: 'normal',
      hold: 0,
      enabled: !owned,
      onUse: () => {
        this.give(what);
        then?.();
      },
    });
  }

  /** Something a counter sells for the buyer's own points, within `reach` of where it lies. */
  private buy(out: InteractionTarget[], d: number, o: OfferDef, reach: number): void {
    if (d > reach) return;
    const g = this.g;
    // ---- arsenal: a gun carried already can be bought again for its ammunition ----
    const full = this.topUp(o.gives);
    const owned = this.holds(o.gives) && full !== false;
    const can = g.session.inv.cash >= o.price && !owned;
    out.push({
      id: `zy-buy-${o.id}`,
      dist: d,
      text: `BUY ${o.name}`,
      sub: full === false ? `$${o.price}, for its ammunition` : owned ? (full ? 'Carried, and its ammunition is full' : 'Carried already') : `$${o.price}`,
      tone: can ? 'good' : 'warn',
      hold: 0,
      enabled: can,
      onUse: () => {
        if (!buyOffer(g.session.inv, o)) return;
        g.audio.play('buy_ok', { priority: 3 });
        this.give(o.gives);
      },
    });
  }

  /** Hand something over to the player who asked for it. */
  private give(what: Gives): void {
    const g = this.g;
    if ('melee' in what) {
      g.melee?.equip(what.melee);
      g.melee?.setOut(true);
      g.feed(MELEE[what.melee]?.name ?? what.melee.toUpperCase(), 'good');
      g.audio.play('pickup_ammo', { priority: 2 });
    } else if ('gun' in what) {
      const inv = g.session.inv;
      // ---- arsenal: the gun joins the others (or, carried already, tops up its ammunition and stays where it is) ----
      const r = addGun(inv, what.gun);
      if (!r.added) {
        g.feed(`+${r.topped} ${WEAPONS[what.gun]?.short ?? what.gun.toUpperCase()} AMMO`, 'good');
        g.audio.play('pickup_ammo', { priority: 2 });
        return;
      }
      inv.activeSlot = r.slot;
      g.weapons.cancelActions();
      g.melee?.setOut(false);
      g.feed(WEAPONS[what.gun]?.name.toUpperCase() ?? what.gun.toUpperCase(), 'good');
      g.audio.play('pickup_ammo', { priority: 2 });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // the HUD and the pause menu's page
  // ---------------------------------------------------------------------------------------------

  /** Where to point for something at `at`: itself, or the doorway between the player and the room it is in. */
  private toward(at: Spot): Spot {
    const there = roomOf(at.x);
    const here = roomOf(this.g.player.x);
    if (there === here) return at;
    // into the room it is in, or the room that room opens off, if that opens off this one (the canteen is up from the
    // second floor, which is up from the street); else out of this one
    for (let r = there; r; r = ENTERED_FROM[r]) if (ENTERED_FROM[r] === here) return WAY[r].in;
    return WAY[here!].out;
  }

  decorateHud(st: HudState, md: MapDynamic): void {
    // there is no clock to show, in a run or after it
    st.timer = { ...st.timer, hidden: true };
    st.subTimer = null;
    st.itemCard = null; // (items: no bench card unless one is standing at a bench)
    if (!this.active) return;
    this.kiosks.decorate(st); // kiosks and mods: the mod's word on the weapon panel
    const v = this.view;
    const p = this.g.player;
    const has = (flag: number): boolean => ZaryaStory.has(v, flag);
    const did = (flag: number): boolean => ZaryaStory.did(v, flag);
    const dist = (o: Spot): number => Math.hypot(o.x - p.x, o.z - p.z);
    const down = inShelter(p.x);
    const rows: Row[] = [];
    const add = (id: string, head: string, detail: string, at: Spot | null, o: Partial<Row> = {}): void => void rows.push({ id, title: head, detail, at, ...o });

    if (v.ch === CH.arrive) {
      if (down) add('boy', 'FIND THE BOY', 'Through the blast door. He is guarding it', ZARYA.kostya);
      else if (inStore(p.x, p.z)) add('down', 'DOWN TO THE SHELTER', 'They always hide in the same place', ZARYA.stairHead);
      else add('door', 'THE STAFF DOOR', 'Round the back of the Univermag. Nina Pavlovna has it open', ZARYA.laneDoor);
    } else if (v.ch === CH.sealed && !this.woken) add('tea', 'THE DOOR HAS SEALED', 'Sit. There is tea', ZARYA.table);
    else if (v.ch === CH.sealed) {
      add('arm', 'TAKE WHAT NINA GIVES YOU', 'The watch room', ZARYA.rack, { done: has(F.armed) });
      add('release', 'FIND THE MANUAL RELEASE', 'A panel by the blast door', ZARYA.release, { locked: !has(F.armed) });
    } else if (v.ch === CH.ground) {
      if (down) add('up', 'UP INTO THE STORE', 'The stairs', ZARYA.stairFoot);
      else add('gena', 'THE GROUND FLOOR', has(F.hall) ? 'The man by the escalator has no breath' : 'Out of the staff rooms, into the hall', has(F.hall) ? ZARYA.gena : ZARYA.staffDoor);
    } else if (v.ch < CH.ended) this.townRows(v, add, dist);
    else if (ENDINGS[v.end]) add('end', ENDINGS[v.end]![0], ENDINGS[v.end]![2], null, { done: true });

    // never more than five lines; the compass follows whoever is being fought, else the nearest open line (a line
    // that points out of the room the player is in counts as farther off than one in it)
    const shown = rows.slice(0, 5).map((r) => {
      const here = r.at ? this.toward(r.at) : null;
      const open = !r.done && !r.locked;
      return { r, here, open, d: open && here && !r.quiet ? dist(here) : -1 };
    });
    const here = roomOf(p.x);
    const far = (s: (typeof shown)[number]): number => s.d + (s.r.at && roomOf(s.r.at.x) !== here ? 1000 : 0);
    let tracked = shown.findIndex((s) => s.r.fight && s.d >= 0);
    if (tracked < 0) {
      shown.forEach((s, i) => {
        if (s.d >= 0 && (tracked < 0 || far(s) < far(shown[tracked]!))) tracked = i;
      });
    }
    const list: HudState['objectives'] = shown.map((s, i) => ({ id: `zy-${s.r.id}`, title: s.r.title, detail: s.r.detail, state: s.r.done ? 'complete' : s.r.locked ? 'locked' : 'active', progress: s.r.progress ?? -1, tracked: i === tracked, distance: s.d, icons: s.r.icons }));
    // (items) the workbench card while a player stands at a bench: what can be built from what is held
    st.itemCard = this.benchCard(v, dist);
    shown.forEach((s, i) => {
      if (!s.here || !s.open) return;
      const on = i === tracked;
      md.markers.push({ id: `zy-m-${s.r.id}`, kind: 'objective', x: s.here.x, z: s.here.z, label: s.r.label ?? s.r.title, color: on ? '#9fffc4' : '#ffb84a', visible: true, compass: on, pulse: on });
    });
    // Line One's stops, wherever it calls now (the nearest is on the compass too, when the way is long)
    if (v.ch >= CH.act2 && v.ch < CH.ended && !roomOf(p.x)) {
      const far = tracked >= 0 && shown[tracked]!.d > 140;
      let near = -1;
      STOPS.forEach((s, i) => {
        if (ZaryaStory.stopOpen(v, s.opens) && (near < 0 || dist(s.door) < dist(STOPS[near]!.door))) near = i;
      });
      STOPS.forEach((s, i) => {
        if (!ZaryaStory.stopOpen(v, s.opens)) return;
        md.markers.push({ id: `zy-stop-${s.id}`, kind: 'landmark', x: s.door.x, z: s.door.z, label: `LINE ONE: ${s.name}`, color: '#8fd0ff', visible: true, compass: far && i === near && dist(s.door) > 12, pulse: false });
      });
    }
    // the town's own short list replaces the operation's contracts
    st.objectives = [...list, ...st.objectives.filter((o) => o.id !== 'defense' && o.id !== 'hunt' && o.id !== 'extract')].slice(0, 5);
    const fought = (has(F.bear) && !has(F.bearDown)) || (did(G.borya) && !did(G.barred)) || (did(G.yaga) && !did(G.yagaDown)) || (did(G.tamada) && !did(G.tamadaDown)) || (did(G.answered) && !did(G.believed) && !did(G.morozkoDown));
    if (!fought || v.end !== 0) st.boss = null;
    // nothing in their hands yet: nothing to read out, nothing to aim
    if (this.unarmed) {
      st.weapon = null;
      st.otherWeapon = null;
      st.crosshair = { ...st.crosshair, hidden: true };
    }
    // and until Gena, nobody has any reason to think the town is dangerous
    if (v.ch < CH.town) st.region = 'low';
  }

  /** The missing part of recipe `r` to go for next: the nearest one in a zone the squad can reach. */
  private nextPart(v: StoryView, r: number, dist: (o: Spot) => number): number {
    const reach = (zone: ZaryaZone): boolean => zone === 'shelter' || zone === 'square' || zone === 'store' || ZaryaStory.zoneOpen(v, zone);
    const missing = Unlock.missing(TOWN, v, r);
    const open = missing.filter((m) => reach(m.zone));
    const from = open.length ? open : missing;
    if (!from.length) return -1;
    return TOWN.parts.indexOf(from.reduce((a, b) => (dist(this.toward(a)) <= dist(this.toward(b)) ? a : b)));
  }

  // ---- items (round 3): the parts' pictures on the HUD ----

  /** The pictures of recipe `r`'s parts still missing, part `first` (the one the compass points at) first. */
  private missingIcons(v: StoryView, r: number, first: number): HudIcon[] {
    const id = TOWN.recipes[r]?.id;
    const out: HudIcon[] = [];
    TOWN.parts.forEach((p, i) => {
      if (p.recipe !== id || Unlock.has(v.parts, i)) return;
      const icon = { src: partIcon(i), label: p.name };
      if (i === first) out.unshift(icon);
      else out.push(icon);
    });
    return out.filter((i) => i.src);
  }

  /**
   * The workbench card, while this player stands at a bench: each thing the squad has begun (a part of it held), its
   * parts lit where held and dim where not, and whether it can be built here; then the mod parts waiting to be fitted.
   * Null away from a bench, or when there is nothing to show.
   */
  private benchCard(v: StoryView, dist: (o: Spot) => number): ItemCard | null {
    if (v.ch < CH.sealed || v.ch >= CH.ended) return null;
    const bench = BENCHES.find((b) => dist(b.at) <= STORY.reach + 1.5);
    if (!bench) return null;
    const rows: ItemCard['rows'] = [];
    TOWN.recipes.forEach((rec, r) => {
      if (r === RECIPE.line || Unlock.has(v.built, r)) return;
      const pr = Unlock.progress(TOWN, v, r);
      if (pr.have === 0) return;
      const icons = TOWN.parts.flatMap((p, i) => (p.recipe === rec.id ? [{ src: partIcon(i), dim: !Unlock.has(v.parts, i), label: p.name }] : []));
      const can = Unlock.canBuild(TOWN, v, r);
      const here = can && (bench.main || r < RECIPE.gvozdomyot);
      rows.push({ name: SHORT[r]!, icons, note: here ? 'READY' : can ? "TIMUR'S BENCH" : `${pr.have} OF ${pr.need}`, ready: here });
    });
    rows.sort((a, b) => Number(!!b.ready) - Number(!!a.ready) || a.icons.filter((i) => i.dim).length - b.icons.filter((i) => i.dim).length);
    const mods = ZaryaStory.modParts(v);
    if (mods > 0) rows.push({ name: 'WEAPON MODS', icons: Array.from({ length: Math.min(mods, 6) }, () => ({ src: MOD_ICON, label: 'Mod part' })), note: `${mods} TO FIT` });
    if (!rows.length) return null;
    return { title: 'WORKBENCH', sub: bench.main ? 'A PROPER BENCH' : '', rows };
  }

  /**
   * The list from Gena on, in the order of what presses: whoever is being fought, the next gates the squad can act on,
   * what is being built, the keys, and when nothing presses, the side things. (`decorateHud` cuts it to five.)
   */
  private townRows(v: StoryView, add: (id: string, head: string, detail: string, at: Spot | null, o?: Partial<Row>) => void, dist: (o: Spot) => number): void {
    const p = this.g.player;
    const has = (flag: number): boolean => ZaryaStory.has(v, flag);
    const did = (flag: number): boolean => ZaryaStory.did(v, flag);
    const count = ZaryaStory.count;
    const spot = (z: Zombie | null, or: Spot): Spot => (z ? { x: z.x, z: z.z } : or);
    const nearest = (list: readonly Spot[]): Spot => list.reduce((a, b) => (dist(this.toward(a)) <= dist(this.toward(b)) ? a : b));
    const act2 = v.ch >= CH.act2;
    const keys = ZaryaStory.keys(v);
    const held = keys.filter(Boolean).length;

    // ---- whoever is being fought: how each is beaten, in a few words ----
    let fought = false;
    if (has(F.guard) && !has(F.guardDown)) {
      fought = true;
      add('guard', 'THE GUARD', 'Woken wrong, and whistling', ZARYA.shutter, { fight: true });
    }
    if (has(F.bear) && !has(F.bearDown)) {
      fought = true;
      add('bear', 'MISHKA', has(F.prize) ? 'At the hook with his back turned' : 'Padding from the front. Get behind him, or hang a prize on the slide', spot(this.named('mishka'), ZARYA.hook), { fight: true });
    }
    if (did(G.borya) && !did(G.barred)) {
      fought = true;
      if (did(G.boryaIn)) add('borya', 'BORYA', 'He is in his cold store. Bar the door', AT.bar, { fight: true });
      else add('borya', 'BORYA', 'Nothing puts him down. Into his cold store, out by the hatch, bar the door', spot(this.named('borya'), RYNOK.coldDoor), { fight: true });
    } else if (did(G.barred) && !did(G.cosmoKey)) add('cosmo', 'HIS KEYS', 'On the hook by the cold store door', AT.cosmoKey);
    if (did(G.yaga) && !did(G.yagaDown)) {
      fought = true;
      if (did(G.exposed)) add('yaga', 'BABA YAGA', 'The hut faces the hall. Now', DK.hut, { fight: true });
      else add('yaga', 'BABA YAGA', 'Safe in her hut. The lever in the wings turns it', AT.lever, { fight: true });
    }
    if (did(G.tamada) && !did(G.tamadaDown)) {
      fought = true;
      const out = count(v.m & 7);
      const left = CANTEEN.plugs.filter((_, i) => (v.m & (1 << i)) === 0);
      if (left.length) add('tamada', 'THE TAMADA', `Every toast wakes more. Pull his loudspeakers' plugs: ${out} of 3`, nearest(left), { progress: out / 3, label: 'PLUG' , fight: true });
      else add('tamada', 'THE TAMADA', 'No microphone, and off his stage. Put him down', spot(this.named('tamada'), CANTEEN.tamada), { fight: true });
    }
    if (did(G.answered) && !did(G.believed) && !did(G.morozkoDown)) {
      fought = true;
      add('morozko', 'MOROZKO', `Weaker for everything you found out: ${count(v.clues)} of ${CLUES.length} clues`, spot(this.named('morozko'), BERLOGA.morozko), { fight: true });
    }

    // ---- the next gates the squad can act on, in the story's order (two at most) ----
    const gates: Row[] = [];
    const gate = (id: string, head: string, detail: string, at: Spot | null, o: Partial<Row> = {}): void => void gates.push({ id, title: head, detail, at, ...o });
    let cuttersShown = false;
    if (v.ch === CH.town) {
      // Line One, once someone has looked in the cab
      if (Unlock.has(v.built, RECIPE.line)) gate('board', 'BOARD THE TRAM', 'Next stop: Rynok', ZARYA.tramDoor);
      else if (has(F.line)) {
        const todo: Spot[] = [];
        if (!has(F.handleFit)) todo.push(Unlock.has(v.parts, PART.handle) ? ZARYA.cab : TOWN.parts[PART.handle]!);
        if (!has(F.fuseFit)) todo.push(!has(F.fuseBox) ? ZARYA.fuseBox : Unlock.has(v.parts, PART.fuse) ? ZARYA.fuseBox : TOWN.parts[PART.fuse]!);
        const handle = has(F.handleFit) ? 'handle in' : Unlock.has(v.parts, PART.handle) ? 'take Zina her handle' : 'her handle: the tea room';
        const fuse = has(F.fuseFit) ? 'fuse in' : Unlock.has(v.parts, PART.fuse) ? "fit the fuse at the stop's box" : has(F.fuseBox) ? "a fuse: the tree's box" : "a line fuse: the stop's box";
        gate('line', 'GET LINE ONE RUNNING', `${handle}; ${fuse}`, todo.length ? nearest(todo) : ZARYA.tramDoor, { progress: ((has(F.handleFit) ? 1 : 0) + (has(F.fuseFit) ? 1 : 0)) / 2, label: 'LINE ONE', icons: this.missingIcons(v, RECIPE.line, -1) });
      } else if (has(F.flare)) gate('line', 'TRAM No. 1', 'Standing at the stop with its lights on', ZARYA.cab);
    } else if (act2) {
      const uncut = TOWN.gates.map((_, i) => i).filter((i) => !Unlock.has(v.gates, i));
      if (uncut.length) {
        if (Unlock.has(v.built, RECIPE.cutters)) {
          const at = nearest(uncut.map((i) => ZaryaStory.where('cut', i)!));
          gate('cut', 'CUT THE CHAINS', sentence(uncut.map((i) => CHAIN_AT[i]).join('; ')), at, { progress: (TOWN.gates.length - uncut.length) / TOWN.gates.length, label: 'CHAINED GATE' });
        } else {
          cuttersShown = true;
          const pr = Unlock.progress(TOWN, v, RECIPE.cutters);
          const mi = this.nextPart(v, RECIPE.cutters, dist);
          if (mi >= 0) gate('cutters', 'BOLT CUTTERS', `For the chained gates. ${pr.have} of ${pr.need}: ${TOWN.parts[mi]!.name.toLowerCase()}, ${WHERE[mi]}`, TOWN.parts[mi]!, { progress: pr.have / pr.need, label: TOWN.parts[mi]!.name.toUpperCase(), icons: this.missingIcons(v, RECIPE.cutters, mi) });
          else gate('cutters', 'BOLT CUTTERS', 'For the chained gates. Every part found: any workbench', nearest(BENCHES.map((q) => q.at)), { progress: 1, label: 'WORKBENCH' });
        }
      }
      if (!did(G.tickets)) gate('tickets', 'THE PALACE OF CULTURE', `Tickets only: three for $${STORY.tickets}, at the box office by its doors`, AT.tickets, { label: 'BOX OFFICE' });
      else if (!did(G.yaga) && !did(G.yagaDown)) gate('pageant', 'THE PAGEANT', 'The Palace doors are open', DK.hallCentre);
      if (!did(G.escalator)) gate('escalator', 'THE ESCALATOR', this.heavy ? 'Padlocked. What you carry will break it' : 'Padlocked. It wants something heavy to swing', AT.escalator);
      else if (!did(G.tamada) && !did(G.tamadaDown)) gate('party', 'THE STAFF PARTY', 'Up the escalators, on the third floor', CANTEEN.tamada);
      if (!did(G.pond)) {
        if (v.dolls > 0) {
          const shut = DOLLS.filter((_, i) => ZaryaStory.shells(v, i) < STORY.dollShells);
          const shells = DOLLS.map((_, i) => `${ZaryaStory.shells(v, i)}`).join(', ');
          gate('dolls', 'THE MATRYOSHKAS', `Stand by a painted doll while the squad fights: every ${STORY.dollKills} down opens a shell. ${shells} of ${STORY.dollShells}`, shut.length ? nearest(shut) : null, { label: 'MATRYOSHKA' });
        } else if (Unlock.has(v.gates, CHAIN.depot)) gate('pond', 'THE POND ROAD', 'Iced shut, west of the depot', GATES.find((q) => q.id === 'pond') ?? null);
      } else if (!did(G.code)) {
        if ((v.clues & (1 << CLUE.plaque)) !== 0) gate('code', 'THE CHECKPOINT', 'The keypad: the year on the plaque', AT.code, { label: 'KEYPAD' });
        else if (this.said.has('codeUnknown')) gate('code', 'THE CHECKPOINT', 'Four digits: a year. The museum would know which', did(G.tickets) ? DK.plaque : AT.tickets, { label: 'THE MUSEUM' });
        else gate('code', 'THE CHECKPOINT', 'A keypad on the road to the Institute', AT.code, { label: 'KEYPAD' });
      } else if (!did(G.keyDoor)) {
        if (!this.seenSlots) gate('lift', 'THE INSTITUTE', 'The freight lift goes down', AT.slots);
        else if (held === 4) gate('slots', 'FOUR KEY SLOTS', 'You hold all four', AT.slots);
        else gate('slots', 'FOUR KEY SLOTS', `Missing: the ${KEYS.filter((_, i) => !keys[i]).map((k) => k.toLowerCase()).join(', the ')}`, null);
      } else if (v.end === 0) {
        if (!did(G.asked)) gate('hall', 'THE BERLOGA', 'Someone is waiting at the far end', BERLOGA.morozko);
        else if (!did(G.answered)) gate('answer', 'HE ASKED A QUESTION', '"Are you warm, child?"', BERLOGA.morozko);
        else if (did(G.believed) || did(G.morozkoDown)) {
          const n = v.turned > 0 ? String(v.turned).length : 0;
          const left = BERLOGA.keys.filter((_, i) => ZaryaStory.can(v, 'turn', i));
          gate('console', 'THE PURGE CONSOLE', did(G.believed) ? `Give him the keys: ${n} of 4` : `Four switches. The order matters: ${n} of 4`, left.length ? nearest(left) : BERLOGA.console, { progress: n / 4, label: 'CONSOLE' });
        }
      }
    }
    for (const r of gates.slice(0, 2)) add(r.id, r.title, r.detail, r.at, r);

    // ---- what is being built: its next missing part, and where that is ----
    const builds: (Row & { left: number })[] = [];
    TOWN.recipes.forEach((_, r) => {
      if (r === RECIPE.line || Unlock.has(v.built, r) || (r === RECIPE.cutters && (cuttersShown || !act2))) return;
      const pr = Unlock.progress(TOWN, v, r);
      if (r === RECIPE.signalka ? has(F.flare) : pr.have === 0) return;
      const mi = this.nextPart(v, r, dist);
      const head = `BUILD THE ${SHORT[r]}`;
      // (items: the pictures of the parts still missing, the one the compass points at first)
      if (mi >= 0) builds.push({ id: `build-${r}`, title: head, detail: `${pr.have} of ${pr.need}: ${TOWN.parts[mi]!.name.toLowerCase()}, ${WHERE[mi]}`, at: TOWN.parts[mi]!, progress: pr.have / pr.need, label: TOWN.parts[mi]!.name.toUpperCase(), left: pr.need - pr.have, icons: this.missingIcons(v, r, mi) });
      else {
        const strong = r >= RECIPE.gvozdomyot;
        const where = r === RECIPE.signalka ? "Both parts: the workbench in the store's maintenance room" : strong ? "Every part: Timur's bench in the garages, or the Institute's" : 'Every part: any workbench';
        builds.push({ id: `build-${r}`, title: head, detail: where, at: r === RECIPE.signalka ? ZARYA.bench : nearest(BENCHES.filter((q) => q.main || !strong).map((q) => q.at)), progress: 1, label: 'WORKBENCH', left: 0 });
      }
    });
    builds.sort((a, b) => a.left - b.left);
    for (const r of builds.slice(0, 2)) add(r.id, r.title, r.detail, r.at, r);
    if (Unlock.has(v.built, RECIPE.signalka) && !has(F.flare)) add('flare', 'FIRE THE SIGNALKA', 'Out on the square', onSquare(p.x, p.z) ? null : { x: 60, z: -2 });

    // ---- the keys, once the first is held ----
    if (held > 0 && !did(G.keyDoor)) add('keys', `THE KEYS  ${held} OF 4`, sentence(KEYS.filter((_, i) => keys[i]).map((k) => k.toLowerCase()).join(', ')), null, { progress: held / 4, quiet: true });

    // ---- when nothing presses: the shutter, the board, the tree, the sleepers ----
    if (fought) return;
    if (!has(F.plug)) {
      if (has(F.guardDown)) add('plug', "PULL THE SHUTTER'S PLUG", 'On the wall beside it. It will not stop banging', ZARYA.plug);
      else if (!has(F.guard)) add('doors', 'THE MAIN DOORS', 'Something by them bangs every four seconds', ZARYA.shutter, { quiet: has(F.flare) });
    }
    if (!has(F.notice)) add('notice', 'THE STAFF NOTICEBOARD', 'By the cloakroom. Worth a look', ZARYA.noticeboard, { quiet: true });
    if (!act2) return;
    // ---- the store's second floor, once the escalator is open: where Kostya was last seen (quiet: on the map, never tracked) ----
    if (did(G.escalator) && (v.clues & (1 << CLUE.den)) === 0) add('toys', 'THE TOY DEPARTMENT', 'Second floor. Where Kostya was last seen', UPSTAIRS.toys, { quiet: true });
    if (ZaryaStory.can(v, 'hang')) add('hang', 'THE TOWN TREE', 'All six ornaments found. They hang on it', AT.hang);
    else if (v.orn !== 0 && !did(G.hung)) add('orn', `GLASS ORNAMENTS  ${count(v.orn)} OF ${ORNAMENTS.length}`, 'Off the town tree', null, { progress: count(v.orn) / ORNAMENTS.length, quiet: true });
    if (v.covered !== 0) add('covered', `SLEEPERS COVERED  ${count(v.covered)}`, 'Against the cold', null, { quiet: true });
    const tools = count((v.m >> 6) & 7);
    if (tools > 0 && tools < TOOLS.length) add('tools', `THE REPAIRMAN'S TOOLS  ${tools} OF ${TOOLS.length}`, 'Lying about the town', null, { progress: tools / TOOLS.length, quiet: true });
  }

  /** The pause menu's JOURNAL page: what the squad has worked out, the keys, what it is building, who it has covered. */
  private journal(): HTMLElement {
    const v = this.view;
    const has = (flag: number): boolean => ZaryaStory.has(v, flag);
    const did = (flag: number): boolean => ZaryaStory.did(v, flag);
    const root = document.createElement('div');
    root.className = 'ds-journal';
    root.style.cssText = 'max-height:56vh;overflow:auto;text-align:left;text-transform:none;letter-spacing:0;padding-right:4px';
    const section = (head: string, rows: string[]): void => {
      const h = document.createElement('h3');
      h.textContent = head;
      h.style.cssText = 'margin:10px 0 4px;font-size:12px;letter-spacing:.14em';
      root.appendChild(h);
      if (!rows.length) return;
      const ul = document.createElement('ul');
      ul.style.cssText = 'margin:0;padding-left:16px;font-size:12px;line-height:1.45';
      for (const r of rows) {
        const li = document.createElement('li');
        li.textContent = r;
        ul.appendChild(li);
      }
      root.appendChild(ul);
    };
    const know: string[] = [];
    if (v.ch >= CH.sealed) know.push('Every clock in town stopped at 23:57. They all run off one master clock, up at the Institute.');
    if (has(F.gena)) know.push('The sleepers breathe, slowly, like someone pulled out from under ice. They cannot be woken, and nothing harms them.');
    if (has(F.gena)) know.push('The ones with no frost at their mouths are not asleep. Gena from the meat rows was the first.');
    if (has(F.guard)) know.push("The guard's breath stopped before he moved. Being woken like that did it. Nobody shake anybody.");
    if (has(F.notice)) know.push("The Institute paid volunteers for a sleep study. Mira's brother Danya took a tab two winters ago.");
    if (has(F.notice)) know.push('Four New Year duty wardens: a cosmonaut, a sun, a sheaf of wheat, a dove.');
    if (has(F.flare)) know.push('The snow comes in on a slant from the north, out of the striped chimney of the heating plant.');
    if (did(G.borya)) know.push('Borya the butcher walks into his cold store forty times a day. It has one door, and a hatch he does not fit through.');
    if (v.dolls > 0) know.push('The painted matryoshkas open a shell when enough of the ones woken wrong are put down beside them.');
    CLUES.forEach((_, i) => {
      if ((v.clues & (1 << i)) !== 0 && KNOWN[i]) know.push(KNOWN[i]!);
    });
    if (ZaryaStory.count((v.m >> 3) & 7) === 3) know.push('The heating plant is set to push steam the right way round. It needs someone at the other end.');
    if (did(G.asked)) know.push('In the story, the girl tells Morozko she is warm. Freezing, and she says yes. And he lets her live.');
    section('WHAT YOU KNOW', know.length ? know : ['Kostya, seven, red hat. Last seen in toys, second floor.']);
    // the people met so far, and what is known about each (`people.ts`)
    root.appendChild(this.people.page());

    // the keys: which are held, and where their order is written
    const keys = ZaryaStory.keys(v);
    const held = keys.filter(Boolean).length;
    if (held > 0 || has(F.notice)) {
      const from = ['Borya the butcher', 'Oleg Petrovich, the bear', 'Lyudmila Markovna, Baba Yaga', 'Vitya from accounts, the toastmaster'];
      const rows = KEYS.flatMap((k, i) => (keys[i] ? [`${sentence(k.toLowerCase())}: held (${from[i]})`] : has(F.notice) ? [`${sentence(k.toLowerCase())}: not found`] : []));
      if (has(F.notice) || held >= 2) rows.push('The mosaic on the front of the Univermag shows the same four figures, in a row.');
      if (did(G.keyDoor)) rows.push('All four opened the door under the Institute.');
      section(`THE KEYS  -  ${held} OF 4`, rows);
    }

    // what is being built, and where its missing parts are (items, round 3: each thing a row of its parts' pictures,
    // found ones lit, missing ones dim with where they are in words)
    const building: JournalBuild[] = [];
    TOWN.recipes.forEach((r, i) => {
      if (v.ch < CH.sealed || (i === RECIPE.line && !has(F.line))) return;
      const pr = Unlock.progress(TOWN, v, i);
      if (i > RECIPE.line && pr.have === 0 && !(i === RECIPE.cutters && v.ch >= CH.act2)) return;
      if (Unlock.has(v.built, i)) {
        building.push({ head: `${r.name}: ${i === RECIPE.line ? 'running' : 'built'}`, parts: [] });
        return;
      }
      const parts = TOWN.parts.flatMap((part, k) => (part.recipe === r.id ? [{ src: partIcon(k), name: part.name, found: Unlock.has(v.parts, k), where: WHERE[k] ?? '' }] : []));
      building.push({ head: `${r.name}, ${pr.have} of ${pr.need}`, parts });
    });
    if (building.length) {
      section('WHAT YOU ARE BUILDING', []);
      root.appendChild(journalBuilds(building));
    }
    if (v.ch >= CH.town) section(`SLEEPERS COVERED  -  ${ZaryaStory.count(v.covered)}`, []);
    if (v.ch >= CH.act2) {
      section(`ORNAMENTS  -  ${ZaryaStory.count(v.orn)} OF ${ORNAMENTS.length}${did(G.hung) ? ', BACK ON THE TREE' : ''}`, []);
      if (v.orn !== 0) root.appendChild(journalIcons(ORNAMENTS.map((_, k) => ({ src: ornamentIcon(k), dim: (v.orn & (1 << k)) === 0, label: 'Glass ornament' }))));
    }
    // kiosks and mods: the squad's mod parts, and what the gun in hand wears
    const mods = this.kiosks.journalLine(v);
    if (mods) section('WEAPON MODS', [mods, 'Fitted at any workbench to the gun in your hands; the Charge mod wants a proper bench.']);
    // (the Zenit's photographs: their own page)
    const prints = this.photos.journal(v);
    if (prints) root.appendChild(prints);
    return root;
  }

  dispose(): void {
    this.look.dispose();
    this.photos.dispose();
    this.question.dispose();
    this.people.dispose();
    this.veil?.remove();
  }
}
