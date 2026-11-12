/**
 * Menus: title, pause, resume prompt, results, error and loading screens. Screens are rebuilt on show (never per
 * frame). The DEPLOY / RESUME callbacks are invoked SYNCHRONOUSLY from the input event handler so the game can
 * request pointer lock and start audio inside the user gesture.
 */
import './styles.css';
import { DEFAULT_SETTINGS, REGIONS, TEAM_SKILL, TEAM_SKILLS, ZOMBIE_DIFFICULTIES, ZOMBIE_DIFFICULTY } from '../config';
import type { BestRun, MissionStats, Settings } from '../types';
import { MAP_IDS, MAP_TEXT, type MapId } from '../world/layout/data';
import { el, fmtClock, fmtInt, fmtMoney, svgEl } from './dom';
import { LATE_CHOICES, LATE_NOTE } from '../net/room';
import { VERSION } from '../version';
import type { AccountInfo, LoginPrompt, MenuCallbacks, MenusApi, ModeInfo, PauseSession, PauseTab, TourStep } from './hudTypes';
import { runTour } from './tour';
import { filmAccess, GATED_FILMS, type FilmAccess, type FilmId } from '../films';
import { GATED_SWITCHES, switchShown, type SwitchId } from '../switches';
import { GATED_MAPS } from '../world/layout/data';
import { icon } from './icons';
import { setReducedMotionSetting } from './prefs';
import { type SettingsPanel, buildControlsPanel, buildSettingsPanel } from './settingsPanel';
import { apiFetch } from '../platform';

type ScreenKind = 'title' | 'pause' | 'resume' | 'results' | 'error';



const CARD_BRIEF = {
  tag: 'SIDE CONTRACT',
  title: 'MAZOKU CARRIERS',
  text: 'Five card carriers walk the map. They cannot be killed: put one down, purge the signal, take the card.',
};

const ROAM_NOTE = 'No mission, no clock and no damage: fly anywhere and learn the zone before you fight on it.';
const PLAY_LEAD = 'Fight through the quarantine zone, finish the contracts, and reach the helicopter alive.';
/**
 * The cinematics: short films set apart from the game, each its own page that opens in a new tab. A new one is a row
 * here (and its page in `vite.config.ts`, its id in `src/films.ts` and in `FILMS` in server/index.mjs). A film an admin
 * keeps private is not shown to players (an admin sees it marked ADMIN ONLY). `cast` and `entry`: its cast's line on the
 * bestiary's CINEMATICS card, and the entry that card opens on.
 */
const CINEMATICS: { id: FilmId; name: string; tagline: string; about: string; length: string; href: string; cast: string; entry: string }[] = [
  {
    id: 'excalibur',
    name: 'EXCALIBUR',
    tagline: 'A knight, a giant, and the blade that ends it.',
    about: 'An anime battle in five acts with its own score and voices. Watch it as a film, or walk and fly through it while it plays.',
    length: '1 MIN 28',
    href: './freeroam.html',
    cast: 'The Black Knight and the Giant of Excalibur',
    entry: 'excalibur-knight',
  },
  {
    id: 'hollow',
    name: 'SLIME HOLLOW',
    tagline: 'The night the Hollow takes Kael, and the brother who brings him back.',
    about: 'A burned village, an army at its gate and a crowd of hundreds, drained to ink when the Hollow Slime wakes. Watch it as a film, or walk and fly through it while it plays.',
    length: '1 MIN 16',
    href: './hollow.html',
    cast: 'Kael, Raigen and the rest of Slime Hollow',
    entry: 'hollow-kael',
  },
];

/**
 * The bestiary's codex on the title: each section of the field guide, opening the 3D page on its first entry (the
 * CINEMATICS card is made from the films this player can see: see `codex()`).
 */
type CodexCard = { group: string; about: string; entry: string; tone: string; map?: MapId; needs?: SwitchId };
/** `map` / `needs`: the section belongs to a map or a mode the admin page can switch off (then it is not shown). */
const CODEX: CodexCard[] = [
  { group: 'THE HORDE', about: 'Shamblers, runners and the armoured, and what each zone has turned into them.', entry: 'shambler', tone: '#a9bf8e' },
  { group: 'ELITES', about: 'The Warden, and the worst each zone has made: better met for yourself.', entry: 'warden', tone: '#ff7a1a' },
  { group: 'MAZOKU CARRIERS', about: 'The card carriers of the card hunt, each with their own card to collect.', entry: 'card-shiroko', tone: '#ff6fa8', needs: 'cards' },
  { group: 'BESIDE YOU', about: 'Co-op operators, trapped survivors and the people who hold out with you.', entry: 'operators', tone: '#6fa8dc' },
  { group: 'VULCAN', about: 'The clan of the Forge: familiar faces, and the rest of the clan.', entry: 'vulcan-leadership', tone: '#ffb060', map: 'forge' },
  { group: 'SAKURA DISTRICT', about: 'Hana & Yuzu, the Kurenai Court, and the infected under the blossoms.', entry: 'sakura-squad', tone: '#ff9ec8', map: 'sakura' },
];
const FILM_TONE = '#b77cff';
/** An admin's (or a dev build's) badge on a film card: players only ever see public films. */
const FILM_BADGE: Partial<Record<FilmAccess, [string, 'good' | 'warn']>> = { 'admin-only': ['ADMIN ONLY', 'warn'], 'dev-only': ['DEV ONLY', 'warn'] };

const COOP_LEAD = 'Play this zone with up to two friends: open a lobby, share the link, press ready together. Revive anyone who goes down, then extract together.';

/** The leaderboards page: which board it shows. */
interface BoardQuery {
  map: MapId;
  mode: 'solo' | 'coop';
  metric: 'fastest' | 'kills';
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare';
  thisVersion: boolean;
}
/** An entry, and the run behind it. */
interface BoardEntry {
  rank: number;
  name: string;
  avatar: string | null;
  value: number;
  run: { mode: string; outcome: string; seconds: number; kills: number; headshots: number; contracts: number; touch: boolean; difficulty: string; version: string | null; day: string | null };
}
/** `/api/leaderboards`: `all` false when every board is switched off. */
interface BoardReply {
  enabled: boolean;
  all?: boolean;
  /** How many players the board ranks at each difficulty. */
  perDifficulty?: Record<string, number>;
  entries: BoardEntry[];
}
const BOARD_MODES = [
  { id: 'solo', label: 'SOLO' },
  { id: 'coop', label: 'CO-OP' },
] as const;
const BOARD_METRICS = [
  { id: 'fastest', label: 'FASTEST ESCAPE' },
  { id: 'kills', label: 'MOST KILLS' },
] as const;

const sentence = (t: string): string => t.charAt(0) + t.slice(1).toLowerCase();

/** Each zone's colour on the title: the headline's rule, its card in the strip, the big button's rim and the shade's tint. */
const MAP_ACCENT: Record<MapId, string> = {
  district: '#6fa8dc',
  sakura: '#ff9ec8',
  forge: '#ff7a1a',
  asylum: '#a9bf8e',
  aurelia: '#e8c46a',
  mujin: '#9fb6d8',
  hirasaka: '#7fc4b8',
  zarya: '#d84a4a',
};
/** A colour as CSS variables: itself, its channels (for see-through tints) and a lighter one for text. */
function accent(node: HTMLElement, hex: string, name: string): void {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lift = c.map((v) => Math.round(v * 0.72 + 255 * 0.28));
  node.style.setProperty(name, hex);
  node.style.setProperty(`${name}-rgb`, c.join(', '));
  node.style.setProperty(`${name}-ink`, `rgb(${lift.join(', ')})`);
}

type NavGlyph = 'play' | 'friends' | 'explore' | 'trophy' | 'book' | 'film' | 'keys' | 'sliders' | 'heart' | 'grid' | 'user' | 'dots' | 'list' | 'left' | 'right' | 'x';
const NAV_PATHS: Record<NavGlyph, string[]> = {
  play: ['M7 4.5v15l12-7.5z'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  user: ['M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 21c1.3-4 4.2-6 7.5-6s6.2 2 7.5 6'],
  dots: ['M5.5 12h.01', 'M12 12h.01', 'M18.5 12h.01'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  friends: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c1.2-3.5 3.7-5.2 6.5-5.2s5.3 1.7 6.5 5.2', 'M16.5 11.5a2.8 2.8 0 1 0 0-5.6', 'M17.5 14.8c2 .4 3.4 1.8 4.2 4.2'],
  explore: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M15.5 8.5l-2 5-5 2 2-5z'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0z', 'M7 6H4a3 3 0 0 0 3 4', 'M17 6h3a3 3 0 0 1-3 4'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 21V5', 'M9 8h6'],
  film: ['M3 5h18v14H3z', 'M7 5v14', 'M17 5v14', 'M3 9.5h4', 'M3 14.5h4', 'M17 9.5h4', 'M17 14.5h4'],
  keys: ['M3 7h18v10H3z', 'M7 11h.01', 'M11 11h.01', 'M15 11h.01', 'M8 14h8'],
  sliders: ['M4 7h16', 'M4 17h16', 'M9 4.5v5', 'M15 14.5v5'],
  heart: ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z'],
};
function navIcon(name: NavGlyph, filled = false): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: 'ds-ic', 'aria-hidden': 'true', focusable: 'false' });
  const wide = name === 'dots';
  for (const d of NAV_PATHS[name]) svgEl('path', { d, fill: filled && name === 'play' ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': wide ? '3' : '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  return svg;
}

const DISCORD_MARK =
  'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z';

class Menus implements MenusApi {
  private root: HTMLElement | null = null;
  private layer!: HTMLElement;
  private screen: HTMLElement | null = null;
  private kind: ScreenKind | null = null;
  private loading: HTMLElement | null = null;
  private loadFill!: HTMLElement;
  private loadText!: HTMLElement;
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private readonly panels = new Set<SettingsPanel>();
  private deployStamp = 0;
  private touch = false;
  private info: ModeInfo = { mode: 'standard', map: 'district', cards: [], difficulty: { zombies: 'normal', team: 'regular' } };
  private lastBest: BestRun | null = null;
  private account: AccountInfo = { online: false, name: null, avatar: null, admin: false, loginUrl: '', loginFailed: false, lockedFilms: [...GATED_FILMS], lockedMaps: [...GATED_MAPS], lockedSwitches: [...GATED_SWITCHES], boards: true };
  private readonly armTimers = new Map<HTMLButtonElement, number>();

  constructor(private readonly cb: MenuCallbacks) {}

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.defaultPrevented) return;
    const active = document.activeElement;
    const free = !active || active === document.body || active === document.documentElement;
    if (this.kind === 'title' && e.key === 'Enter' && free) {
      e.preventDefault();
      this.deploy();
    } else if (this.kind === 'resume' && (e.key === 'Enter' || e.key === ' ') && free) {
      e.preventDefault();
      this.cb.onResume();
    }
  };

  mount(root: HTMLElement): void {
    if (this.root) return;
    this.root = root;
    this.layer = el('div', 'ds-menus', root);
    window.addEventListener('keydown', this.onKey);
  }

  get visible(): boolean {
    return this.kind !== null;
  }

  // -------------------------------------------------------------------------------------------
  // settings
  // -------------------------------------------------------------------------------------------

  setSettings(settings: Settings): void {
    this.settings = { ...settings };
    setReducedMotionSetting(settings.reducedMotion);
    for (const p of this.panels) p.sync(this.settings);
  }

  setTouchMode(touch: boolean): void {
    this.touch = touch;
  }

  setAccount(info: AccountInfo): void {
    this.account = info;
    if (this.kind === 'title') this.showTitle(this.lastBest);
  }

  /**
   * The pick needs a Discord sign-in: a guest (signed out, with a server to sign in to) plays only the maps open to
   * guests, never co-op or the card hunt. The game works it out (`ModeInfo.login`).
   */
  private get locked(): boolean {
    return this.guest && !!this.info.login;
  }

  /** Signed out, with a server to sign in to. */
  private get guest(): boolean {
    return this.account.online && this.account.name === null;
  }

  /** The films this player may watch, each with its access (a private film is only an admin's, until it is public). */
  private visibleFilms(): { film: (typeof CINEMATICS)[number]; access: FilmAccess }[] {
    return CINEMATICS.map((film) => ({ film, access: filmAccess(this.account, film.id) })).filter((f) => f.access !== 'locked');
  }

  /** Is this switched on for this player (or are they an admin)? */
  private shown(id: SwitchId): boolean {
    return switchShown(this.account, id);
  }

  /** A map this player may see: open, or they are an admin (a dev build with no server sees them all). */
  private mapShown(map: MapId): boolean {
    if (!this.account.lockedMaps.includes(map)) return true;
    return this.account.online ? this.account.admin : import.meta.env.DEV;
  }

  /**
   * The codex cards: the bestiary's sections that belong to nothing switched off, and the CINEMATICS one only with the
   * casts of the films this player can see.
   */
  private codex(): CodexCard[] {
    const cards = CODEX.filter((c) => (!c.map || this.mapShown(c.map)) && (!c.needs || this.shown(c.needs)));
    const films = this.visibleFilms().map((f) => f.film);
    if (!films.length) return cards;
    return [...cards, { group: 'CINEMATICS', about: `${films.map((f) => f.cast).join('; ')}.`, entry: films[0]!.entry, tone: FILM_TONE }];
  }

  /** The maps this player may pick, with an admin's access badge on a gated one (all of them before the account is known). */
  private visibleMaps(): { id: MapId; badge?: string; badgeTone?: 'good' | 'warn' }[] {
    return this.info.maps ?? MAP_IDS.map((id) => ({ id }));
  }

  setModeInfo(info: ModeInfo): void {
    this.info = info;
    if (this.kind === 'title') this.showTitle(this.lastBest);
  }

  /** The title's graphics button (null off the title). */
  private qualityChip: HTMLButtonElement | null = null;

  private syncQualityChip(): void {
    const c = this.qualityChip;
    if (!c) return;
    c.replaceChildren();
    el('span', 'ql', c, 'GRAPHICS');
    el('span', 'qv', c, `${this.settings.qualityAuto ? 'AUTO ' : ''}${this.settings.quality.toUpperCase()}`);
  }

  private pushSetting(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.syncQualityChip();
    if (patch.reducedMotion !== undefined) setReducedMotionSetting(patch.reducedMotion);
    for (const p of this.panels) p.sync(this.settings);
    this.cb.onSettingsChange({ ...this.settings });
  }

  private makeSettingsPanel(): HTMLElement {
    const panel = buildSettingsPanel((patch) => this.pushSetting(patch), this.touch);
    panel.sync(this.settings);
    this.panels.add(panel);
    return panel.root;
  }

  // -------------------------------------------------------------------------------------------
  // screen management
  // -------------------------------------------------------------------------------------------

  private setScreen(kind: ScreenKind, node: HTMLElement): void {
    this.screen = node;
    this.kind = kind;
    node.classList.add('ds-screen', `ds-${kind}`);
    this.layer.appendChild(node);
  }

  private clearScreen(): void {
    for (const [btn, id] of this.armTimers) {
      window.clearTimeout(id);
      this.armTimers.delete(btn);
    }
    this.panels.clear();
    this.screen?.remove();
    this.screen = null;
    this.kind = null;
  }

  hide(): void {
    this.clearScreen();
  }

  private deploy(): void {
    if (this.locked) return;
    const t = performance.now();
    if (t - this.deployStamp < 400) return;
    this.deployStamp = t;
    this.cb.onDeploy();
  }

  /**
   * A compact choice: a button showing the current pick that opens a short list (with a line about each option)
   * right under it. Closes on a pick, a click elsewhere or Escape.
   */
  private picker(parent: HTMLElement, label: string, options: { id: string; label: string; note: string }[], current: string, pick: (id: string) => void): void {
    const wrap = el('div', 'picker', parent);
    const cur = options.find((o) => o.id === current) ?? options[0]!;
    const btn = this.button(wrap, '', 'pick', () => toggle());
    el('span', 'pl', btn, label);
    el('span', 'pv', btn, cur.label);
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = cur.note;
    const list = el('div', 'ds-pop ds-panel', wrap);
    list.hidden = true;
    list.setAttribute('role', 'listbox');
    const away = (e: Event): void => {
      if (!wrap.contains(e.target as Node)) toggle(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') toggle(false);
    };
    const toggle = (open = list.hidden): void => {
      list.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', esc, true);
      } else {
        document.removeEventListener('pointerdown', away, true);
        document.removeEventListener('keydown', esc, true);
      }
    };
    for (const o of options) {
      const item = this.button(list, '', o.id === current ? 'opt on' : 'opt', () => {
        toggle(false);
        if (o.id !== current) pick(o.id);
      });
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', o.id === current ? 'true' : 'false');
      el('b', '', item, o.label);
      el('span', '', item, o.note);
    }
  }

  private button(parent: HTMLElement, label: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', `ds-btn ${cls}`.trim(), parent, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  /** Destructive action button: first click arms it ("CONFIRM"), second click within 3 s runs the action. */
  private confirmButton(parent: HTMLElement, label: string, cls: string, onConfirm: () => void): HTMLButtonElement {
    const b = this.button(parent, label, cls, () => {
      const timer = this.armTimers.get(b);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        this.armTimers.delete(b);
        b.classList.remove('armed');
        b.textContent = label;
        onConfirm();
        return;
      }
      b.classList.add('armed');
      b.textContent = 'CONFIRM';
      this.armTimers.set(
        b,
        window.setTimeout(() => {
          this.armTimers.delete(b);
          b.classList.remove('armed');
          b.textContent = label;
        }, 3000),
      );
    });
    return b;
  }

  private tabs(parent: HTMLElement, controls: HTMLElement, settings: HTMLElement, initial: 'controls' | 'settings', extra: PauseTab | null = null): (which: 'controls' | 'settings') => void {
    const bar = el('div', 'ds-tabs', parent);
    bar.setAttribute('role', 'tablist');
    const body = el('div', 'ds-tabbody', parent);
    // a map's own page first (the Sakura District's journal), when it has one
    const pages: [HTMLElement, HTMLButtonElement][] = [];
    if (extra) pages.push([extra.build(), el('button', 'tab', bar, extra.label) as HTMLButtonElement]);
    pages.push([controls, el('button', 'tab', bar, 'CONTROLS') as HTMLButtonElement], [settings, el('button', 'tab', bar, 'SETTINGS') as HTMLButtonElement]);
    for (const [page, b] of pages) {
      body.append(page);
      b.type = 'button';
      b.setAttribute('role', 'tab');
    }
    const pick = (i: number): void =>
      pages.forEach(([page, b], k) => {
        page.hidden = k !== i;
        b.classList.toggle('on', k === i);
        b.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
    const off = extra ? 1 : 0;
    const show = (which: 'controls' | 'settings'): void => pick(off + (which === 'controls' ? 0 : 1));
    pages.forEach(([, b], k) => b.addEventListener('click', () => pick(k)));
    show(initial);
    return show;
  }

  /** A map's own page in the pause menu (the Sakura District's journal), asked for each time the menu opens. */
  pauseTab: (() => PauseTab | null) | null = null;
  /** What the results call the boxes opened (ZARYA: Ded Moroz's sack). */
  boxStat = 'MYSTERY BOXES';

  // -------------------------------------------------------------------------------------------
  // title
  // -------------------------------------------------------------------------------------------

  /** The title's page: the side menu's PLAY / WITH FRIENDS / EXPLORE follow the mode; LEADERBOARDS is its own page. */
  private titlePage: 'play' | 'boards' | 'films' | 'codex' | 'credits' = 'play';
  /** The title's extra options (squad skill, the card hunt) stay open across redraws once opened. */
  private moreOpen = false;
  /** What the leaderboards page shows. */
  private board: BoardQuery = { map: 'district', mode: 'solo', metric: 'fastest', difficulty: 'normal', thisVersion: false };
  private boardMapSet = false;
  private boardReq = 0;

  /** The mode switch beside the big button (Solo / With friends / Free roam); the dock's pages change nothing. */
  private goPage(p: 'play' | 'friends' | 'explore' | 'boards' | 'films' | 'codex' | 'credits'): void {
    const m = this.info.mode;
    this.titlePage = p === 'boards' || p === 'films' || p === 'codex' || p === 'credits' ? p : 'play';
    if (p === 'play') {
      if (m === 'roam') this.cb.onRoamChange(false);
      else if (m === 'coop') this.cb.onModeChange(this.info.roamBase ?? 'standard');
    } else if (p === 'friends') {
      if (m !== 'coop') this.cb.onModeChange('coop');
    } else if (p === 'explore') {
      if (m === 'coop') this.cb.onModeChange(this.info.roamBase ?? 'standard');
      if (this.info.mode !== 'roam') this.cb.onRoamChange(true);
    }
    // a mode change has redrawn the title already; this one lands the page and the focus
    this.showTitle(this.lastBest);
    this.screen?.querySelector<HTMLElement>('.ds-l-mode.on, .ds-l-item.on, .ds-l-back')?.focus({ preventScroll: true });
  }

  /** Back from a page of the dock to the zone, keeping the mode as it is. */
  private backToZone(): void {
    this.titlePage = 'play';
    this.showTitle(this.lastBest);
    this.screen?.querySelector<HTMLElement>('.ds-l-cta .ds-btn')?.focus({ preventScroll: true });
  }

  /** The zone after (or before) the picked one, among those that can be picked now. */
  private stepZone(dir: 1 | -1): void {
    if (this.info.lockedMap) return;
    const ids = this.visibleMaps().map((m) => m.id);
    const i = ids.indexOf(this.info.map);
    if (i < 0 || ids.length < 2) return;
    const next = ids[(i + dir + ids.length) % ids.length]!;
    this.cb.onMapChange(next);
    this.screen?.querySelector<HTMLElement>(`.ds-l-zone[data-map="${next}"]`)?.focus({ preventScroll: true });
  }

  showTitle(best: BestRun | null): void {
    this.clearScreen();
    this.lastBest = best;
    if (!this.boardMapSet) {
      this.board.map = this.info.map;
      this.boardMapSet = true;
    }
    // a board this player can see (an admin-only map has none for them)
    const maps = this.visibleMaps();
    const boardMaps = maps.map((m) => m.id);
    if (!boardMaps.includes(this.board.map) && boardMaps.length) this.board.map = boardMaps[0]!;
    const mode = this.info.mode;
    const roam = mode === 'roam';
    const coop = mode === 'coop';
    const boards = this.titlePage === 'boards';
    const films = this.titlePage === 'films';
    const codex = this.titlePage === 'codex';
    const credits = this.titlePage === 'credits';
    const elsewhere = boards || films || codex || credits;
    const text = MAP_TEXT[this.info.map];
    const root = el('div', elsewhere ? 'ds-launch page' : 'ds-launch');
    root.dataset.map = this.info.map;
    accent(root, MAP_ACCENT[this.info.map], '--acc');
    el('div', 'ds-shade', root);
    el('div', 'ds-l-mood', root);
    el('div', 'ds-scanlines still', root);
    el('div', 'ds-l-ticks', root);

    // controls and settings open over everything, from the dock
    const panel = el('div', 'ds-sidepanel ds-panel ds-brk', root);
    const closePanel = (): void => {
      panel.classList.remove('floating');
      this.screen?.querySelector<HTMLElement>('.ds-l-cta .ds-btn, .ds-l-back')?.focus({ preventScroll: true });
    };
    const close = this.button(panel, 'CLOSE', 'mini closer', closePanel);
    close.setAttribute('aria-label', 'Close');
    const show = this.tabs(panel, buildControlsPanel(this.touch), this.makeSettingsPanel(), 'controls');
    this.button(panel, 'SHOW THE TOUR AGAIN', 'ghost tour-again', () => {
      closePanel();
      this.cb.onTourAgain();
    });
    const showTab = (w: 'controls' | 'settings'): void => {
      setSheet(null);
      show(w);
      panel.classList.add('floating');
      close.focus({ preventScroll: true });
    };
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePanel();
      }
    });

    // one sheet at a time over the title (on a phone: the pages, the brief, the extra options), closed by Escape or a tap elsewhere
    let sheetOpen: HTMLElement | null = null;
    let sheetButton: HTMLElement | null = null;
    const away = (e: Event): void => {
      const t = e.target as Node;
      if (sheetOpen && !sheetOpen.contains(t) && !sheetButton?.contains(t)) setSheet(null);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      const back = sheetButton;
      setSheet(null);
      back?.focus({ preventScroll: true });
    };
    const detach = (): void => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', esc, true);
    };
    const setSheet = (sheet: HTMLElement | null, from: HTMLElement | null = null): void => {
      if (sheetOpen) {
        sheetOpen.classList.remove('open');
        sheetButton?.setAttribute('aria-expanded', 'false');
      }
      sheetOpen = sheet;
      sheetButton = sheet ? from : null;
      // the extra options stay open across a redraw (a pick in them redraws the title)
      this.moreOpen = !!sheet?.classList.contains('ds-l-more');
      root.classList.toggle('sheet-open', !!sheet);
      // the extra options live in the left column: it comes up over the zones while they are open
      root.classList.toggle('more-open', this.moreOpen);
      if (sheet) {
        sheet.classList.add('open');
        from?.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', esc, true);
      } else detach();
    };
    // the listeners go with the screen
    const observer = new MutationObserver(() => {
      if (!root.isConnected) {
        detach();
        observer.disconnect();
      }
    });
    const toggleSheet = (sheet: HTMLElement, from: HTMLElement): void => setSheet(sheetOpen === sheet ? null : sheet, from);
    const sheetHead = (sheet: HTMLElement, title: string): void => {
      const h = el('div', 'ds-l-sheet-h', sheet);
      el('span', 'haz', h);
      el('span', 't', h, title);
      const x = this.button(h, '', 'ds-l-x', () => {
        const back = sheetButton;
        setSheet(null);
        back?.focus({ preventScroll: true });
      });
      x.appendChild(navIcon('x'));
      x.setAttribute('aria-label', 'Close');
    };

    // ---- along the top: the name, the pages, the account ----
    const top = el('header', 'ds-l-top', root);
    const brand = el('div', 'ds-l-brand', top);
    el('span', 'l1', brand, 'ZOMBIES');
    const l2 = el('span', 'l2', brand);
    el('i', '', l2);
    el('span', '', l2, 'GENXMIMS');
    const nav = el('nav', 'ds-l-nav', top);
    nav.setAttribute('aria-label', 'Main menu');
    // what the admin page has switched off is not on the menu at all (an admin still sees it)
    type Page = { label: string; glyph: NavGlyph; about: string; on: boolean; go: () => void; quick?: boolean };
    const pages: Page[] = [];
    if (this.account.boards || this.account.admin) pages.push({ label: 'LEADERBOARDS', glyph: 'trophy', about: "Each player's best run on a zone.", on: boards, go: () => this.goPage('boards'), quick: true });
    if (this.visibleFilms().length > 0) pages.push({ label: 'CINEMATICS', glyph: 'film', about: 'Short films set apart from the game.', on: films, go: () => this.goPage('films') });
    if (this.shown('bestiary')) pages.push({ label: 'BESTIARY', glyph: 'book', about: 'The field guide, in 3D.', on: codex, go: () => this.goPage('codex') });
    pages.push(
      { label: 'CONTROLS', glyph: 'keys', about: 'Every key and touch control.', on: false, go: () => showTab('controls'), quick: true },
      { label: 'SETTINGS', glyph: 'sliders', about: 'Graphics, audio, sensitivity.', on: false, go: () => showTab('settings'), quick: true },
      { label: 'CREDITS', glyph: 'heart', about: 'Who made it, and what it is built on.', on: credits, go: () => this.goPage('credits') },
    );
    // on a phone: EXPLORE opens every page in a sheet, and the most used ones stay as icons
    const explore = this.button(nav, '', 'ds-l-item explore', () => toggleSheet((exploreSheet ??= buildExplore()), explore));
    explore.appendChild(navIcon('grid'));
    el('span', '', explore, 'EXPLORE');
    explore.setAttribute('aria-label', 'Explore: every page');
    explore.setAttribute('aria-expanded', 'false');
    for (const p of pages) {
      const b = this.button(nav, '', `ds-l-item${p.on ? ' on' : ''}${p.quick ? ' quick' : ''}`, p.go);
      b.appendChild(navIcon(p.glyph));
      el('span', '', b, p.label);
      // on a phone only the icon shows: the name stays with the button
      b.setAttribute('aria-label', p.label);
      if (p.on) b.setAttribute('aria-current', 'page');
    }
    // the sheets are built when first opened: a redraw of the title stays small on a weak phone
    let exploreSheet: HTMLElement | null = null;
    const buildExplore = (): HTMLElement => {
      const sheet = el('div', 'ds-l-sheet ds-l-explore', root);
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-label', 'Explore');
      sheetHead(sheet, 'EXPLORE');
      const ex = el('div', 'ex', sheet);
      for (const p of pages) {
        const b = this.button(ex, '', p.on ? 'ds-l-exi on' : 'ds-l-exi', () => {
          setSheet(null);
          p.go();
        });
        el('span', 'ic', b).appendChild(navIcon(p.glyph));
        const t = el('span', 't', b);
        el('b', '', t, p.label);
        el('span', '', t, p.about);
      }
      return sheet;
    };

    if (this.guest) {
      // a guest: playing the free zones; one click to sign in for the rest
      const acct = el('div', 'ds-l-acct guest', top);
      el('span', 'avatar', acct, '?');
      el('b', 'nm', acct, 'GUEST');
      const inn = this.button(acct, '', 'ds-l-signin', () => this.cb.onSignIn('foot'));
      const mark = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, inn);
      svgEl('path', { d: DISCORD_MARK, fill: 'currentColor' }, mark);
      el('span', 'long', inn, 'Sign in with Discord');
      el('span', 'short', inn, 'Sign in');
      inn.setAttribute('aria-label', 'Sign in with Discord');
    } else if (this.account.online) {
      const acct = el('div', 'ds-l-acct', top);
      if (this.account.avatar) {
        const img = el('img', 'avatar', acct);
        img.src = this.account.avatar;
        img.alt = '';
      } else el('span', 'avatar', acct, (this.account.name ?? '?').slice(0, 1).toUpperCase());
      const who = el('div', 'who', acct);
      el('b', '', who, this.account.name ?? '');
      const tools = el('div', 'tools', who);
      if (this.account.admin) {
        const link = el('a', 'lnk admin', tools, 'Admin');
        link.href = '/admin';
      }
      const out = this.button(tools, 'Sign out', 'lnk', () => this.cb.onLogout());
      out.classList.remove('ds-btn');
    }

    // ---- the page ----
    const main = el('main', 'ds-l-main', root);
    let first: HTMLElement | null = null;
    if (elsewhere) {
      const back = this.button(main, '', 'ds-l-back', () => this.backToZone());
      back.appendChild(navIcon('left'));
      el('span', '', back, `BACK TO ${text.name}`);
      const host = el('div', 'ds-l-pagehost', main);
      if (boards) this.buildBoards(host);
      else if (films) this.buildCinematics(host);
      else if (codex) this.buildCodex(host);
      else this.buildCredits(host);
    } else {
      const zoneIndex = Math.max(0, maps.findIndex((m) => m.id === this.info.map));
      const head = el('section', 'ds-l-hero', main);
      head.dataset.n = String(zoneIndex + 1).padStart(2, '0');
      const kick = el('div', 'kicker', head);
      el('span', 'haz', kick);
      el('span', '', kick, coop ? `WITH FRIENDS  //  UP TO THREE PLAYERS` : roam ? 'FREE ROAM  //  NO MISSION, NO DAMAGE' : text.kicker);
      el('h1', text.name.length > 10 ? 'name long' : 'name', head, text.name);
      el('p', 'tag', head, text.tagline);
      el('p', 'lead', head, coop ? COOP_LEAD : roam ? ROAM_NOTE : text.name === 'MUJIN' ? 'Get the dead station running before the night takes it, and catch the dawn train.' : text.name === 'HIRASAKA' ? 'Go down into the mine under the sea, and climb back up without looking back.' : PLAY_LEAD);

      const act = el('section', 'ds-l-act', main);
      const cta = el('div', 'ds-l-cta', act);
      const playrow = el('div', 'ds-l-playrow', cta);
      const diffLabel = ZOMBIE_DIFFICULTY[this.info.difficulty.zombies].label;
      if (this.locked) {
        const login = this.info.login ?? 'map';
        first = this.discordButton(playrow, login === 'map' ? 'SIGN IN WITH DISCORD TO PLAY THIS ZONE' : 'SIGN IN WITH DISCORD TO PLAY', login === 'map' ? this.info.map : login);
      } else {
        const label = roam ? 'FREE ROAM' : coop ? 'OPEN LOBBY' : 'PLAY';
        // only the label is the button's text (scripts find it by it); the line under it comes from CSS
        const go = this.button(playrow, '', label === 'PLAY' ? 'primary big ds-l-play' : 'primary big ds-l-play long', () => this.deploy());
        go.dataset.sub = coop ? 'CO-OP  ·  UP TO 3 PLAYERS' : roam ? `${text.name}  ·  NO DAMAGE` : `${text.name}  ·  ${diffLabel}`;
        el('span', 'ico', go).appendChild(navIcon(coop ? 'friends' : roam ? 'explore' : 'play', true));
        el('span', 'lbl', go, label);
        el('span', 'scan', go);
        go.setAttribute('aria-label', roam ? `Free roam ${text.name}` : coop ? 'Open the co-op lobby' : `Play ${text.name}`);
        first = go;
      }
      // the mode beside the big button
      const modeList: [string, string, NavGlyph, boolean, () => void][] = [['SOLO', '', 'user', !coop && !roam, () => this.goPage('play')]];
      if (this.shown('coop')) modeList.push(['FRIENDS', 'WITH ', 'friends', coop, () => this.goPage('friends')]);
      if (this.shown('roam')) modeList.push(['ROAM', 'FREE ', 'explore', roam, () => this.goPage('explore')]);
      if (modeList.length > 1) {
        const modes = el('div', 'ds-l-modes', playrow);
        modes.setAttribute('role', 'group');
        modes.setAttribute('aria-label', 'Mode');
        for (const [label, lead, glyph, on, go] of modeList) {
          const b = this.button(modes, '', on ? 'ds-l-mode on' : 'ds-l-mode', () => {
            if (!on) go();
          });
          b.appendChild(navIcon(glyph));
          const t = el('span', 't', b);
          // the whole name is the button's text; a phone shows the short one
          if (lead) el('span', 'w', t, lead);
          t.append(label);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      }
      if (this.locked) {
        const why = el('div', 'why', cta);
        el('b', '', why, this.account.loginFailed ? 'SIGN-IN DID NOT COMPLETE - TRY AGAIN' : 'FREE, RIGHT HERE IN YOUR BROWSER');
        el('span', '', why, 'One click. Only your Discord name and avatar are read.');
        // a zone open to guests, one click away
        const free = this.info.freeMap;
        if (free && free !== this.info.map) this.button(cta, `PLAY ${MAP_TEXT[free].name.toUpperCase()} NOW - NO SIGN-IN`, 'ghost free', () => this.cb.onMapChange(free));
      }

      // the small choices under it: difficulty, the story, more options, and (on a phone) the brief
      const chips = el('div', 'ds-l-chips', act);
      const brief = el('section', 'ds-l-brief ds-l-sheet', root);
      if (!this.locked && !roam) {
        const d = this.info.difficulty;
        this.picker(chips, 'DIFFICULTY', ZOMBIE_DIFFICULTIES.map((id) => ({ id, label: ZOMBIE_DIFFICULTY[id].label, note: ZOMBIE_DIFFICULTY[id].note })), d.zombies, (id) => this.cb.onDifficultyChange({ ...d, zombies: id as typeof d.zombies }));
        // the Sakura District: the operation or KAIKA, the story (in co-op the lobby picks)
        const stories = this.info.stories;
        if (stories && !coop) this.picker(chips, 'STORY', [{ id: '', label: 'THE OPERATION', note: 'The district\'s own operation: both contracts, then extract.' }, ...stories], this.info.story ?? '', (id) => this.cb.onStoryChange(id || null));
        const more = this.button(chips, '', 'pick ds-l-chip more', () => toggleSheet((moreSheet ??= buildMore()), more));
        more.appendChild(navIcon('dots'));
        el('span', 'pv', more, 'MORE OPTIONS');
        more.setAttribute('aria-label', 'More options');
        more.setAttribute('aria-haspopup', 'dialog');
        more.setAttribute('aria-expanded', 'false');
        // squad skill and the card hunt (built when first opened)
        let moreSheet: HTMLElement | null = null;
        const buildMore = (): HTMLElement => {
          const sheet = el('div', 'ds-l-sheet ds-l-more', chips);
          sheet.setAttribute('role', 'dialog');
          sheet.setAttribute('aria-label', 'More options');
          sheetHead(sheet, 'MORE OPTIONS');
          el('span', 'sec', sheet, 'SQUAD AI');
          const squad = el('div', 'opts', sheet);
          squad.setAttribute('role', 'radiogroup');
          squad.setAttribute('aria-label', 'Squad AI');
          for (const id of TEAM_SKILLS) {
            const on = id === d.team;
            const o = this.button(squad, '', on ? 'opt on' : 'opt', () => {
              if (!on) this.cb.onDifficultyChange({ ...d, team: id });
            });
            o.setAttribute('role', 'radio');
            o.setAttribute('aria-checked', on ? 'true' : 'false');
            el('b', '', o, TEAM_SKILL[id].label);
            el('span', '', o, TEAM_SKILL[id].note);
          }
          if (coop) el('span', 'hint', sheet, 'These are the defaults for a lobby you open; its owner can change them there.');
          else if (this.shown('cards')) {
            const hunt = mode === 'cards';
            const row = el('div', 'hunt', sheet);
            const t = el('div', 'ht', row);
            el('b', '', t, 'MAZOKU CARD HUNT');
            el('span', 'hint', t, this.guest ? 'Adds five card carriers to put down and collect. Cards are kept on your account: needs a Discord sign-in.' : 'Adds five card carriers to put down and collect, on top of the mission.');
            const tg = this.button(row, '', hunt ? 'toggle on' : 'toggle', () => this.cb.onModeChange(hunt ? 'standard' : 'cards'));
            el('i', 'knob', tg);
            el('span', '', tg, hunt ? 'ON' : 'OFF');
            tg.setAttribute('aria-pressed', hunt ? 'true' : 'false');
            tg.setAttribute('aria-label', 'Mazoku card hunt');
          }
          return sheet;
        };
        // it stays open across a redraw (a pick in it redraws the title)
        if (this.moreOpen) setSheet((moreSheet = buildMore()), more);
      }
      const briefBtn = this.button(chips, '', 'pick ds-l-chip brief-btn', () => toggleSheet(brief, briefBtn));
      briefBtn.appendChild(navIcon('list'));
      el('span', 'pv', briefBtn, 'BRIEF');
      briefBtn.setAttribute('aria-label', 'What you do here');
      briefBtn.setAttribute('aria-expanded', 'false');
      el(
        'p',
        'ds-l-note',
        act,
        this.locked
          ? 'Zones marked FREE play without signing in. The leaderboards and the bestiary are open to everyone.'
          : this.guest
            ? `Playing as a guest: no sign-in needed here. ${this.touch ? 'Tap II at any time to pause.' : 'Press Enter to play, Esc pauses.'}`
            : this.touch ? 'Play goes fullscreen. Tap II at any time to pause.' : 'Press Enter to play. Esc pauses at any time.',
      );

      // what you do on this zone: a card on the right (a sheet behind BRIEF on a phone)
      brief.setAttribute('aria-label', 'What you do here');
      const bh = el('div', 'ds-l-sheet-h', brief);
      el('span', 'haz', bh);
      el('span', 't', bh, roam ? 'THE MISSION, FOR LATER' : 'WHAT YOU DO HERE');
      const rows = text.rows;
      // the card hunt goes in before the extraction (the last row)
      const briefRows = mode === 'cards' ? [...rows.slice(0, -1), CARD_BRIEF, rows[rows.length - 1]!] : rows;
      el('span', 'n', bh, `${String(briefRows.length).padStart(2, '0')} OBJ`);
      const bx = this.button(bh, '', 'ds-l-x', () => {
        setSheet(null);
        briefBtn.focus({ preventScroll: true });
      });
      bx.appendChild(navIcon('x'));
      bx.setAttribute('aria-label', 'Close');
      const ol = el('ol', '', brief);
      for (const r of briefRows) {
        const li = el('li', '', ol);
        el('b', '', li, r.title);
        el('span', '', li, r.text);
      }

      // ---- the zones, along the bottom ----
      const zones = el('section', 'ds-l-zones', root);
      const zh = el('div', 'zh', zones);
      el('h2', '', zh, 'ZONES');
      const sig = el('span', 'sig', zh);
      for (let i = 0; i < 4; i++) el('i', '', sig);
      el('span', 'rule', zh);
      const count = el('span', 'count', zh);
      el('b', '', count, String(zoneIndex + 1).padStart(2, '0'));
      el('span', '', count, ` / ${String(maps.length).padStart(2, '0')}`);
      const locked = this.info.lockedMap ?? null;
      if (!locked && maps.length > 1) {
        for (const [dir, glyph, label] of [[-1, 'left', 'Previous zone'], [1, 'right', 'Next zone']] as const) {
          const a = this.button(zh, '', 'ds-l-arrow', () => this.stepZone(dir));
          a.appendChild(navIcon(glyph));
          a.setAttribute('aria-label', label);
        }
      }
      const list = el('div', 'list', zones);
      list.setAttribute('role', 'radiogroup');
      list.setAttribute('aria-label', 'Zone');
      // the zones this player may pick (a gated map is hidden until it is public); an admin sees a gated map's access
      maps.forEach(({ id, badge, badgeTone }, i) => {
        const on = id === this.info.map;
        const z = this.button(list, '', on ? 'ds-l-zone on' : 'ds-l-zone', () => {
          if (!on) this.cb.onMapChange(id);
        });
        z.dataset.map = id;
        accent(z, MAP_ACCENT[id], '--zc');
        z.setAttribute('role', 'radio');
        z.setAttribute('aria-checked', on ? 'true' : 'false');
        z.tabIndex = on ? 0 : -1;
        const zt = el('span', 'ztop', z);
        el('span', 'zi', zt, String(i + 1).padStart(2, '0'));
        if (badge) el('span', `zb ${badgeTone ?? ''}`, zt, badge);
        el('span', 'zn', z, MAP_TEXT[id].name);
        el('span', 'zt', z, MAP_TEXT[id].tagline);
        if (locked && !on) {
          z.disabled = true;
          z.title = 'Leave the co-op session to change the map';
        }
      });
      // arrow keys move along the zones, as in any radio group
      list.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.stepZone(1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.stepZone(-1);
        else return;
        e.preventDefault();
      });
      // the picked zone in view in the strip (a phone scrolls it sideways)
      requestAnimationFrame(() => {
        const sel = list.querySelector<HTMLElement>('.ds-l-zone.on');
        if (sel && list.scrollWidth > list.clientWidth) list.scrollLeft = sel.offsetLeft - (list.clientWidth - sel.offsetWidth) / 2;
      });
      // room for the co-op lobby, which a phone held upright shows under the big button
      el('div', 'ds-l-lobbyspace', root);
    }

    // ---- the foot: your best run and the graphics preset ----
    const foot = el('footer', 'ds-l-foot', root);
    const bestEl = el('div', 'ds-l-best', foot);
    // a phone shows only BEST
    const lbl = el('span', 'lbl', bestEl);
    el('span', 'w', lbl, 'YOUR ');
    lbl.append('BEST');
    el('span', 'w', lbl, ' EXTRACTION');
    if (best) {
      const v = el('span', 'val', bestEl);
      el('b', '', v, fmtClock(best.time));
      v.append(`  ·  ${fmtInt(best.kills)} KILLS / ${fmtInt(best.headshots)} HS`);
    } else el('span', 'val none', bestEl, 'NONE YET');
    // the graphics preset, in plain sight: one tap opens Settings to change it
    this.qualityChip = this.button(foot, '', 'quality', () => showTab('settings'));
    this.qualityChip.title = 'Graphics quality - open Settings to change it';
    this.syncQualityChip();

    this.setScreen('title', root);
    observer.observe(this.layer, { childList: true });
    (first ?? this.screen?.querySelector<HTMLElement>('.ds-l-back, .ds-l-item.on'))?.focus({ preventScroll: true });
  }

  // -------------------------------------------------------------------------------------------
  // cinematics (a page of the title)
  // -------------------------------------------------------------------------------------------

  private buildCinematics(main: HTMLElement): void {
    const page = el('section', 'ds-l-boards ds-l-films', main);
    el('h1', 'name', page, 'CINEMATICS');
    el('p', 'lead', page, 'Short films set apart from the game. Each opens in a new tab: watch it as a film, or step out of the camera and walk around inside it.');
    const list = el('div', 'list', page);
    for (const { film: f, access } of this.visibleFilms()) {
      const card = this.button(list, '', 'ds-l-zone ds-l-film', () => window.open(f.href, '_blank', 'noopener'));
      card.dataset.film = f.id;
      card.setAttribute('aria-label', `Watch ${f.name} (opens in a new tab)`);
      const zn = el('span', 'zn', card, f.name);
      const badge = FILM_BADGE[access] ?? (this.account.admin ? (['PUBLIC', 'good'] as const) : null);
      if (badge) el('span', `zb ${badge[1]}`, zn, badge[0]);
      el('span', 'zt', card, f.tagline);
      el('span', 'zt about', card, f.about);
      el('span', 'zon', card, `WATCH  ▸  ${f.length}`);
    }
    el('p', 'lead soon', page, 'More are on the way.');
  }

  // -------------------------------------------------------------------------------------------
  // credits (a page of the title): the game this one grew from, and what it is built with
  // -------------------------------------------------------------------------------------------

  private buildCredits(main: HTMLElement): void {
    const page = el('section', 'ds-l-boards ds-l-films ds-l-credits', main);
    el('h1', 'name', page, 'CREDITS');
    el('p', 'lead', page, 'Zombies GenXmims is made by GenXmims. It grew out of an open-source game, and it stands on the work of the people below.');
    const list = el('div', 'list', page);
    const entry = (name: string, role: string, about: string, licence: string, link?: { href: string; label: string }): void => {
      const card = el('div', 'ds-l-zone ds-l-film ds-l-credit', list);
      el('span', 'zn', card, name);
      el('span', 'zt', card, role);
      el('span', 'zt about', card, about);
      const foot = el('span', 'zon', card, licence);
      if (link) {
        const a = el('a', 'lnk', foot, link.label);
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener';
      }
    };
    entry(
      'BRIDGEMIND',
      'The original game: Dead Signal: Exclusion Zone',
      'Zombies GenXmims started from BridgeMind\'s open-source zombie game (the Sonnet 5.5 Zombies Game). The original had the main map, The District, a short mission brief and some of the zombie models; everything else was built on top of it here.',
      'MIT LICENCE  ·  ',
      { href: 'https://github.com/bridge-mind/sonnet-5-5-zombies-game', label: 'github.com/bridge-mind/sonnet-5-5-zombies-game' },
    );
    entry(
      'THE CLAUDE OPUS 5.5 ZOMBIES GAME',
      'Its sibling, also by BridgeMind',
      'The same game made by Claude Opus 5.5, released alongside it.',
      'MIT LICENCE  ·  ',
      { href: 'https://github.com/bridge-mind/claude-opus-5.5-zombies-game', label: 'github.com/bridge-mind/claude-opus-5.5-zombies-game' },
    );
    entry('THREE.JS', '3D engine', 'Everything you see is drawn with three.js.', 'MIT LICENCE, © THREE.JS AUTHORS  ·  ', { href: 'https://threejs.org/', label: 'threejs.org' });
    entry('PIXIV: THREE-VRM', 'Character models', 'Loads and animates the anime cast.', 'MIT LICENCE, © PIXIV INC.  ·  ', { href: 'https://github.com/pixiv/three-vrm', label: 'github.com/pixiv/three-vrm' });
    entry('VROID PROJECT (PIXIV)', 'The cast\'s base models', 'The VRoid Studio sample characters, slimmed down for the browser; the Mazoku carriers\' real-asset models (beta) are built from them.', 'FREE TO USE, CREDIT NOT REQUIRED  ·  ', { href: 'https://opengameart.org/content/vroid-studio-cc0-models', label: 'opengameart.org' });
    entry('QUATERNIUS', 'Props and a zombie model', 'The zombie, barrels, cones, hydrants, tyres and pallets.', 'CC0 1.0  ·  ', { href: 'https://quaternius.com/', label: 'quaternius.com' });
    entry('MAKEHUMAN', "The Asylum's real-asset people (beta)", "Bodies, skin, eyes, hair and clothes from MakeHuman's system assets, built in Blender with MPFB.", 'CC0 1.0  ·  ', { href: 'http://www.makehumancommunity.org/', label: 'makehumancommunity.org' });
    entry('VULCAN', 'The Vulcan logo, the Ignis icon and the community\'s names', 'Used with the community\'s go-ahead.', '', { href: 'https://vulcan.genxmims.org/', label: 'vulcan.genxmims.org' });
    entry('MUSIC AND VOICES', 'The cinematics\', MUJIN\'s and HIRASAKA\'s scores and voices','Generated with Google Lyria (music), ElevenLabs and Fish Audio (voices).', '');
    const notes = el('p', 'lead soon', page, 'The licence texts for the code: ');
    const a = el('a', 'lnk', notes, 'LICENSE.txt');
    a.href = '/LICENSE.txt';
    a.target = '_blank';
    a.rel = 'noopener';
  }

  // -------------------------------------------------------------------------------------------
  // the bestiary's codex (a page of the title; the 3D field guide opens from it)
  // -------------------------------------------------------------------------------------------

  private buildCodex(main: HTMLElement): void {
    const page = el('section', 'ds-l-boards ds-l-films ds-l-codex', main);
    el('h1', 'name', page, 'BESTIARY');
    el('p', 'lead', page, 'The field guide: everything you meet out there, in 3D. Open a section, or the whole guide, in a new tab.');
    const open = (hash = ''): void => void window.open(`./bestiary.html${hash}`, '_blank', 'noopener');
    const go = this.button(page, 'OPEN THE BESTIARY  ▸', 'primary ds-l-codex-open', () => open());
    go.setAttribute('aria-label', 'Open the bestiary (opens in a new tab)');
    const list = el('div', 'list', page);
    for (const c of this.codex()) {
      const card = this.button(list, '', 'ds-l-zone ds-l-film', () => open(`#${c.entry}`));
      card.style.setProperty('--zc', c.tone);
      card.setAttribute('aria-label', `${c.group}: open in the bestiary (new tab)`);
      el('span', 'zn', card, c.group);
      el('span', 'zt', card, c.about);
      el('span', 'zon', card, 'VIEW  ▸');
    }
  }

  // -------------------------------------------------------------------------------------------
  // leaderboards (a page of the title)
  // -------------------------------------------------------------------------------------------

  private buildBoards(main: HTMLElement): void {
    main.replaceChildren();
    const q = this.board;
    const page = el('section', 'ds-l-boards', main);
    el('h1', 'name', page, 'LEADERBOARDS');
    el('p', 'lead', page, 'Each player\'s best run on a zone, at one difficulty. Point at a row (tap on a phone) to see the run.');
    if (this.account.admin) el('p', 'lead admin', page, 'You are an admin, so your own runs are not on the boards.');
    const filters = el('div', 'filters', page);
    const seg = (label: string, options: readonly { id: string; label: string }[], current: string, pick: (id: string) => void): void => {
      const g = el('div', 'seg', filters);
      g.setAttribute('role', 'radiogroup');
      g.setAttribute('aria-label', label);
      for (const o of options) {
        const b = this.button(g, o.label, o.id === current ? 'on' : '', () => {
          if (o.id === current) return;
          pick(o.id);
          this.buildBoards(main);
          main.querySelector<HTMLElement>(`[data-k="${label}:${o.id}"]`)?.focus({ preventScroll: true });
        });
        b.dataset.k = `${label}:${o.id}`;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', o.id === current ? 'true' : 'false');
      }
    };
    seg('Zone', this.visibleMaps().map(({ id }) => ({ id, label: MAP_TEXT[id].name.replace(/^THE /, '') })), q.map, (id) => (q.map = id as MapId));
    seg('Difficulty', ZOMBIE_DIFFICULTIES.map((id) => ({ id, label: ZOMBIE_DIFFICULTY[id].label })), q.difficulty, (id) => (q.difficulty = id as BoardQuery['difficulty']));
    seg('Played', BOARD_MODES, q.mode, (id) => (q.mode = id as BoardQuery['mode']));
    seg('Rank by', BOARD_METRICS, q.metric, (id) => (q.metric = id as BoardQuery['metric']));
    const only = el('label', 'only', filters);
    const box = el('input', '', only);
    box.type = 'checkbox';
    box.checked = q.thisVersion;
    el('span', '', only, `This version only (${VERSION})`);
    box.addEventListener('change', () => {
      q.thisVersion = box.checked;
      this.loadBoard(list, card);
    });
    const results = el('div', 'results', page);
    const list = el('ol', 'list', results);
    list.setAttribute('aria-label', 'Leaderboard');
    const card = el('aside', 'card', results);
    card.setAttribute('aria-live', 'polite');
    this.loadBoard(list, card);
  }

  /** The details card: the run behind an entry (or a word on how to see one). */
  private boardCard(card: HTMLElement, e: BoardEntry | null): void {
    card.replaceChildren();
    if (!e) {
      el('p', 'hint', card, this.touch ? 'Tap a player to see their run.' : 'Point at a player to see their run.');
      return;
    }
    const r = e.run;
    el('b', 'who', card, e.name);
    el('span', 'what', card, r.outcome === 'victory' ? `Extracted in ${fmtClock(r.seconds)}` : `Fell after ${fmtClock(r.seconds)}`);
    const dl = el('dl', '', card);
    const row = (k: string, v: string): void => {
      el('dt', '', dl, k);
      el('dd', '', dl, v);
    };
    row('Kills', fmtInt(r.kills));
    row('Headshots', fmtInt(r.headshots));
    row('Contracts', String(r.contracts));
    row('Played', r.mode === 'coop' ? 'Co-op' : r.mode === 'cards' ? 'Standard Mazoku' : 'Standard');
    row('Difficulty', sentence(ZOMBIE_DIFFICULTY[r.difficulty as keyof typeof ZOMBIE_DIFFICULTY]?.label ?? 'NORMAL'));
    row('On', r.touch ? 'A phone or tablet' : 'A computer');
    row('Version', r.version ? `v${r.version}` : 'Before v0.1.108');
    row('Date', r.day ?? '');
  }

  /** Fetch the board the filters describe and draw it (a stale answer is dropped). */
  private loadBoard(list: HTMLElement, card: HTMLElement): void {
    const q = this.board;
    const req = ++this.boardReq;
    list.replaceChildren();
    this.boardCard(card, null);
    const say = (text: string): void => {
      list.replaceChildren();
      el('li', 'empty', list, text);
    };
    if (!this.account.online) return say('Leaderboards need the game server - they show on the live site.');
    say('Loading...');
    const params = new URLSearchParams({ map: q.map, mode: q.mode, metric: q.metric, difficulty: q.difficulty });
    if (q.thisVersion) params.set('version', VERSION.replace(/^v/, ''));
    void apiFetch(`/api/leaderboards?${params}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<BoardReply>) : null))
      .catch(() => null)
      .then((data) => {
        if (req !== this.boardReq || !list.isConnected) return;
        if (!data) return say('The leaderboards could not be loaded. Try again in a moment.');
        if (!data.enabled) return say(data.all === false ? 'The leaderboards are switched off for now.' : 'This board is switched off for now.');
        // how many players each difficulty has, on its button
        const per = data.perDifficulty ?? {};
        for (const d of ZOMBIE_DIFFICULTIES) {
          const b = list.closest('.ds-l-boards')?.querySelector<HTMLElement>(`[data-k="Difficulty:${d}"]`);
          if (!b) continue;
          b.replaceChildren(ZOMBIE_DIFFICULTY[d].label);
          if (per[d]) el('span', 'cnt', b, String(per[d]));
        }
        if (!data.entries.length) {
          // empty here, but not everywhere: say where the runs are
          const elsewhere = ZOMBIE_DIFFICULTIES.filter((d) => (per[d] ?? 0) > 0);
          return say(
            elsewhere.length
              ? `No runs at ${sentence(ZOMBIE_DIFFICULTY[q.difficulty].label)} yet. ${elsewhere.map((d) => `${sentence(ZOMBIE_DIFFICULTY[d].label)} has ${per[d]}`).join(', ')} - pick it above.`
              : 'No runs on this board yet. Yours could be the first.',
          );
        }
        list.replaceChildren();
        for (const e of data.entries) {
          // one line each: the rank, the player, the result; the rest of the run is on the card
          const li = el('li', e.rank <= 3 ? `row top${e.rank}` : 'row', list);
          li.tabIndex = 0;
          el('span', 'rk', li, String(e.rank));
          if (e.avatar) {
            const img = el('img', 'av', li);
            img.src = e.avatar;
            img.alt = '';
            img.loading = 'lazy';
          } else el('span', 'av', li, (e.name || '?').slice(0, 1).toUpperCase());
          el('span', 'nm', li, e.name);
          el('span', 'val', li, q.metric === 'fastest' ? fmtClock(e.value) : fmtInt(e.value));
          const show = (): void => {
            for (const x of list.querySelectorAll('.row.sel')) x.classList.remove('sel');
            li.classList.add('sel');
            this.boardCard(card, e);
          };
          li.addEventListener('pointerenter', show);
          li.addEventListener('focus', show);
          li.addEventListener('click', show);
        }
      });
  }

  // -------------------------------------------------------------------------------------------
  // pause + resume
  // -------------------------------------------------------------------------------------------

  showPause(session: PauseSession | null = null): void {
    this.clearScreen();
    const root = el('div', '');
    el('div', 'ds-scrim', root);
    const panel = el('div', 'ds-pause-panel ds-panel ds-brk', root);
    const head = el('div', 'ds-panel-head big', panel);
    el('span', '', head, session ? 'CO-OP SESSION' : 'MISSION SUSPENDED');
    el('span', 'aux', head, 'PAUSED');
    if (session) {
      // the session's code, to bring someone in, and (server-hosted) who may still join
      const co = el('div', 'ds-pause-coop', panel);
      const row = el('div', 'row', co);
      el('span', 'lbl', row, 'CODE');
      el('b', 'code', row, session.code);
      const copy = this.button(row, 'COPY INVITE LINK', 'mini', () => {
        void navigator.clipboard?.writeText(session.link);
        copy.textContent = 'COPIED';
      });
      if (session.serverHosted) {
        const lr = el('div', 'row', co);
        el('span', 'lbl', lr, 'JOINING MID-GAME');
        if (session.owner) {
          for (const [id, label] of LATE_CHOICES) {
            const b = this.button(lr, label, session.late === id ? 'mini on' : 'mini', () => {
              if (id === session.late) return;
              session.setLate(id);
              this.showPause({ ...session, late: id });
            });
            b.setAttribute('aria-pressed', session.late === id ? 'true' : 'false');
          }
        } else el('span', 'val', lr, LATE_CHOICES.find((c) => c[0] === session.late)?.[1] ?? '');
        el('div', 'note', co, `${LATE_NOTE[session.late]} Anyone invited always can.`);
      } else el('div', 'note', co, "Self-hosted: nobody new can come in until the run is over and you are back in the lobby.");
    }
    this.tabs(panel, buildControlsPanel(this.touch), this.makeSettingsPanel(), 'controls', this.pauseTab?.() ?? null);
    const actions = el('div', 'actions', panel);
    const resume = this.button(actions, 'RESUME', 'primary', () => this.cb.onResume());
    this.confirmButton(actions, 'RESTART MISSION', '', () => this.cb.onRestart());
    this.confirmButton(actions, 'QUIT TO TITLE', '', () => this.cb.onQuitToTitle());
    this.setScreen('pause', root);
    resume.focus({ preventScroll: true });
  }

  showResumePrompt(reason: string, withMenu = false, text: { title?: string; note?: string } = {}, session: PauseSession | null = null): void {
    this.clearScreen();
    const root = el('div', '');
    el('div', 'ds-scrim light', root);
    const box = el('div', 'ds-resume-box ds-panel ds-brk', root);
    el('div', 'ttl', box, text.title ?? 'SIGNAL INTERRUPTED');
    el('div', 'why', box, reason);
    const btn = this.button(box, text.title ? (this.touch ? 'TAP TO JOIN' : 'CLICK TO JOIN') : this.touch ? 'TAP TO RESUME' : 'CLICK TO RESUME', 'primary', () => this.cb.onResume());
    const menu = withMenu ? this.button(box, 'SETTINGS AND OPTIONS', '', () => this.showPause(session)) : null;
    el('div', 'note', box, text.note ?? 'The simulation is frozen until you resume.');
    root.addEventListener('click', (e) => {
      if (e.target !== btn && e.target !== menu) this.cb.onResume();
    });
    this.setScreen('resume', root);
    btn.focus({ preventScroll: true });
  }

  // -------------------------------------------------------------------------------------------
  // results
  // -------------------------------------------------------------------------------------------

  showResults(stats: MissionStats, best: BestRun | null, isNewBest: boolean): void {
    this.clearScreen();
    const win = stats.outcome === 'victory';
    const root = el('div', '');
    root.dataset.outcome = stats.outcome;
    el('div', 'ds-scrim', root);
    const panel = el('div', 'ds-results-panel ds-panel ds-brk', root);
    el('div', 'hazbar', panel);

    const hdr = el('div', 'hdr', panel);
    el('div', 'kick', hdr, win ? 'OPERATION COMPLETE' : 'OPERATION TERMINATED');
    el('div', 'oc', hdr, win ? 'EXTRACTION SUCCESSFUL' : 'MISSION FAILED');
    if (!(win && stats.reason.trim().toLowerCase() === 'extracted')) el('div', 'reason', hdr, stats.reason.toUpperCase());

    const accuracy = stats.shotsFired > 0 ? `${Math.round((stats.shotsHit / stats.shotsFired) * 100)}%` : '--';
    const hsPct = stats.kills > 0 ? ` (${Math.round((stats.headshots / stats.kills) * 100)}%)` : '';
    const region = REGIONS[stats.highestRegion];

    const grid = el('div', 'grid', panel);
    const cell = (label: string, value: string, tone = ''): void => {
      const c = el('div', `c ${tone}`.trim(), grid);
      el('span', 'l', c, label);
      el('span', 'v', c, value);
    };
    cell('TIME SURVIVED', fmtClock(stats.timeSurvived), 'big');
    cell('KILLS', fmtInt(stats.kills), 'big');
    cell('HEADSHOTS', `${fmtInt(stats.headshots)}${hsPct}`);
    cell('ACCURACY', `${accuracy}   ${fmtInt(stats.shotsHit)} / ${fmtInt(stats.shotsFired)}`);
    cell('CONTRACTS', `${stats.contractsCompleted} / ${stats.contractsTotal}`, stats.contractsCompleted >= stats.contractsTotal ? 'good' : '');
    if (stats.cardsTotal > 0) cell('CARDS RECOVERED', `${stats.cardsRecovered} / ${stats.cardsTotal}`, stats.cardsRecovered >= stats.cardsTotal ? 'good' : '');
    cell(this.boxStat, fmtInt(stats.cratesOpened));
    cell('CASH EARNED', fmtMoney(stats.cashEarned));
    cell('CASH SPENT', fmtMoney(stats.cashSpent));
    cell('AMMO COLLECTED', fmtInt(stats.ammoCollected));
    cell('PLATES COLLECTED', fmtInt(stats.platesCollected));
    const threat = el('div', `c threat ${stats.highestRegion}`, grid);
    el('span', 'l', threat, 'HIGHEST THREAT');
    el('span', 'v', threat, region.name);

    const bestEl = el('div', 'best', panel);
    if (win && isNewBest) {
      el('span', 'flag', bestEl, 'NEW PERSONAL BEST');
      el('span', 'txt', bestEl, `${fmtClock(stats.timeSurvived)} extraction time recorded`);
    } else if (best) {
      el('span', 'lbl', bestEl, 'BEST EXTRACTION');
      el('span', 'val', bestEl, fmtClock(best.time));
      if (win) {
        const delta = Math.round(stats.timeSurvived - best.time);
        el('span', `delta ${delta <= 0 ? 'good' : 'bad'}`, bestEl, `${delta <= 0 ? '-' : '+'}${fmtClock(Math.abs(delta))} vs this run`);
      } else {
        el('span', 'txt', bestEl, `${fmtInt(best.kills)} kills  /  ${fmtInt(best.headshots)} headshots  /  ${fmtMoney(best.cash)}`);
      }
    } else {
      el('span', 'txt', bestEl, win ? 'First extraction on file.' : 'Only successful extractions are recorded.');
    }
    // a guest's run never ranks: one click to sign in, so the next one does
    if (this.guest && this.account.boards) {
      const nudge = el('div', 'ds-results-signin', panel);
      el('span', 'txt', nudge, 'Played as a guest: this run is not on the leaderboards. Sign in with Discord and your next runs are.');
      const inn = this.button(nudge, 'SIGN IN WITH DISCORD', 'ghost', () => this.cb.onSignIn('board'));
      inn.setAttribute('aria-label', 'Sign in with Discord to put your runs on the leaderboards');
    }

    const actions = el('div', 'actions', panel);
    const again = this.button(actions, 'REDEPLOY', 'primary', () => this.cb.onRestart());
    this.button(actions, 'RETURN TO TITLE', '', () => this.cb.onQuitToTitle());
    this.setScreen('results', root);
    again.focus({ preventScroll: true });
  }

  // -------------------------------------------------------------------------------------------
  // error + loading
  // -------------------------------------------------------------------------------------------

  showError(title: string, message: string, details?: string): void {
    this.clearScreen();
    const root = el('div', '');
    el('div', 'ds-scrim heavy', root);
    const box = el('div', 'ds-error-box ds-panel ds-brk', root);
    const head = el('div', 'ds-panel-head big', box);
    el('span', '', head, 'SYSTEM FAULT');
    el('span', 'aux', head).appendChild(icon('hazard'));
    el('div', 'ttl', box, title);
    el('p', 'msg', box, message);
    if (details) el('pre', 'det', box, details);
    const actions = el('div', 'actions', box);
    const reload = this.button(actions, 'RELOAD PAGE', 'primary', () => window.location.reload());
    this.setScreen('error', root);
    reload.focus({ preventScroll: true });
  }

  showLoading(fraction: number, text: string): void {
    if (!this.root) return;
    if (!this.loading) {
      this.loading = el('div', 'ds-loading', this.layer);
      this.loadText = el('div', 'txt', this.loading);
      const bar = el('div', 'bar', this.loading);
      this.loadFill = el('i', '', bar);
    }
    this.loadText.textContent = text;
    this.loadFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction)).toFixed(3)})`;
  }

  /** The Discord sign-in button (`reason` goes to the analytics). */
  private discordButton(parent: HTMLElement, label: string, reason: string): HTMLButtonElement {
    const b = this.button(parent, '', 'primary big discord', () => this.cb.onSignIn(reason));
    const mark = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, b);
    svgEl('path', { d: DISCORD_MARK, fill: 'currentColor' }, mark);
    el('span', '', b, label);
    return b;
  }

  /** Ask a guest to sign in, over the title (outside the screen node: a redraw of the title keeps it). */
  showLoginPrompt(p: LoginPrompt): void {
    if (!this.root) return;
    this.layer.querySelector('.ds-login')?.remove();
    const back = el('div', 'ds-login', this.layer);
    const box = el('div', 'ds-login-box ds-panel ds-brk', back);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', p.title);
    el('h2', '', box, p.title);
    el('p', '', box, p.text);
    const acts = el('div', 'acts', box);
    const go = this.discordButton(acts, 'SIGN IN WITH DISCORD', p.reason);
    const close = (): void => {
      back.remove();
      this.screen?.querySelector<HTMLElement>('.ds-l-cta .ds-btn')?.focus({ preventScroll: true });
    };
    if (p.free) {
      const map = p.free.map;
      this.button(acts, p.free.label, 'ghost', () => {
        back.remove();
        if (map !== this.info.map) this.cb.onMapChange(map);
      });
    }
    this.button(acts, 'NOT NOW', 'ghost', close);
    el('span', 'fine', box, 'Free. One click. Only your Discord name and avatar are read.');
    back.addEventListener('click', (e) => {
      if (e.target === back) close();
    });
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    });
    go.focus({ preventScroll: true });
  }

  /** The first-run tour over the title screen. */
  startTour(steps: TourStep[]): void {
    if (!this.root || this.kind !== 'title' || !steps.length) return;
    runTour(this.layer, steps, (event, detail) => this.cb.onTour(event, detail));
  }

  flash(text: string): void {
    if (!this.root) return;
    const box = el('div', 'ds-flash', this.layer, text);
    box.setAttribute('role', 'status');
    window.setTimeout(() => box.classList.add('out'), 5000);
    window.setTimeout(() => box.remove(), 5600);
  }

  hideLoading(): void {
    this.loading?.remove();
    this.loading = null;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.clearScreen();
    this.hideLoading();
    this.layer?.remove();
    this.root = null;
  }
}

export function createMenus(cb: MenuCallbacks): MenusApi {
  return new Menus(cb);
}
