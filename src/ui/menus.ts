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
import type { AccountInfo, MenuCallbacks, MenusApi, ModeInfo } from './hudTypes';
import { icon } from './icons';
import { setReducedMotionSetting } from './prefs';
import { type SettingsPanel, buildControlsPanel, buildSettingsPanel } from './settingsPanel';

type ScreenKind = 'title' | 'pause' | 'resume' | 'results' | 'error';


const CARD_BRIEF = {
  tag: 'SIDE CONTRACT',
  title: 'MAZOKU CARRIERS',
  text: 'Five card carriers walk the map. They cannot be killed: put one down, purge the signal, take the card.',
};

const ROAM_NOTE = 'No mission, no clock and no damage: fly anywhere and learn the zone before you fight on it.';
const PLAY_LEAD = 'Fight through the quarantine zone, finish the contracts, and reach the helicopter alive.';
const COOP_LEAD = 'Play this zone with up to two friends: open a lobby, share the link, press ready together. Revive anyone who goes down, then extract together.';

/** The leaderboards page: which board it shows. */
interface BoardQuery {
  map: MapId;
  mode: 'standard' | 'cards' | 'coop';
  metric: 'fastest' | 'kills' | 'headshots';
  version: string;
  difficulty: string;
}
/** `/api/leaderboards`: `all` false when every board is switched off. */
interface BoardReply {
  enabled: boolean;
  all?: boolean;
  versions?: string[];
  entries: { rank: number; name: string; avatar: string | null; value: number; version: string | null; day: string | null }[];
}
const BOARD_MODES = [
  { id: 'standard', label: 'SOLO' },
  { id: 'cards', label: 'MAZOKU' },
  { id: 'coop', label: 'CO-OP' },
] as const;
const BOARD_METRICS = [
  { id: 'fastest', label: 'FASTEST EXTRACTION' },
  { id: 'kills', label: 'MOST KILLS' },
  { id: 'headshots', label: 'MOST HEADSHOTS' },
] as const;

const sentence = (t: string): string => t.charAt(0) + t.slice(1).toLowerCase();

type NavGlyph = 'play' | 'friends' | 'explore' | 'trophy' | 'book' | 'keys' | 'sliders';
const NAV_PATHS: Record<NavGlyph, string[]> = {
  play: ['M7 4.5v15l12-7.5z'],
  friends: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c1.2-3.5 3.7-5.2 6.5-5.2s5.3 1.7 6.5 5.2', 'M16.5 11.5a2.8 2.8 0 1 0 0-5.6', 'M17.5 14.8c2 .4 3.4 1.8 4.2 4.2'],
  explore: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M15.5 8.5l-2 5-5 2 2-5z'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0z', 'M7 6H4a3 3 0 0 0 3 4', 'M17 6h3a3 3 0 0 1-3 4'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 21V5', 'M9 8h6'],
  keys: ['M3 7h18v10H3z', 'M7 11h.01', 'M11 11h.01', 'M15 11h.01', 'M8 14h8'],
  sliders: ['M4 7h16', 'M4 17h16', 'M9 4.5v5', 'M15 14.5v5'],
};
function navIcon(name: NavGlyph): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: 'ds-ic', 'aria-hidden': 'true', focusable: 'false' });
  for (const d of NAV_PATHS[name]) svgEl('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
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
  private account: AccountInfo = { online: false, name: null, avatar: null, admin: false, loginUrl: '', loginFailed: false };
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

  /** Playing needs a signed-in account whenever there is a server to sign in to. */
  private get locked(): boolean {
    return this.account.online && this.account.name === null;
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
    el('span', 'qv', c, this.settings.quality.toUpperCase());
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

  private tabs(parent: HTMLElement, controls: HTMLElement, settings: HTMLElement, initial: 'controls' | 'settings'): (which: 'controls' | 'settings') => void {
    const bar = el('div', 'ds-tabs', parent);
    bar.setAttribute('role', 'tablist');
    const body = el('div', 'ds-tabbody', parent);
    body.append(controls, settings);
    const bC = el('button', 'tab', bar, 'CONTROLS');
    const bS = el('button', 'tab', bar, 'SETTINGS');
    for (const b of [bC, bS]) {
      b.type = 'button';
      b.setAttribute('role', 'tab');
    }
    const show = (which: 'controls' | 'settings'): void => {
      const c = which === 'controls';
      controls.hidden = !c;
      settings.hidden = c;
      bC.classList.toggle('on', c);
      bS.classList.toggle('on', !c);
      bC.setAttribute('aria-selected', c ? 'true' : 'false');
      bS.setAttribute('aria-selected', c ? 'false' : 'true');
    };
    bC.addEventListener('click', () => show('controls'));
    bS.addEventListener('click', () => show('settings'));
    show(initial);
    return show;
  }

  // -------------------------------------------------------------------------------------------
  // title
  // -------------------------------------------------------------------------------------------

  /** The title's page: the side menu's PLAY / WITH FRIENDS / EXPLORE follow the mode; LEADERBOARDS is its own page. */
  private titlePage: 'play' | 'boards' = 'play';
  /** The title's extra options (squad skill, the card hunt) stay open across redraws once opened. */
  private moreOpen = false;
  /** What the leaderboards page shows. */
  private board: BoardQuery = { map: 'district', mode: 'standard', metric: 'fastest', version: '', difficulty: '' };
  private boardMapSet = false;
  private boardReq = 0;

  /** The side menu: the mode follows the page (Play / With friends / Explore); Leaderboards changes nothing. */
  private goPage(p: 'play' | 'friends' | 'explore' | 'boards'): void {
    const m = this.info.mode;
    this.titlePage = p === 'boards' ? 'boards' : 'play';
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
    this.screen?.querySelector<HTMLElement>('.ds-l-item.on')?.focus({ preventScroll: true });
  }

  showTitle(best: BestRun | null): void {
    this.clearScreen();
    this.lastBest = best;
    if (!this.boardMapSet) {
      this.board.map = this.info.map;
      this.boardMapSet = true;
    }
    const mode = this.info.mode;
    const roam = mode === 'roam';
    const coop = mode === 'coop';
    const boards = this.titlePage === 'boards';
    const text = MAP_TEXT[this.info.map];
    const root = el('div', 'ds-launch');
    el('div', 'ds-shade', root);
    el('div', 'ds-scanlines', root);

    // controls and settings open over everything, from the side menu
    const panel = el('div', 'ds-sidepanel ds-panel ds-brk', root);
    const closePanel = (): void => {
      panel.classList.remove('floating');
      this.screen?.querySelector<HTMLElement>('.ds-l-item.on')?.focus({ preventScroll: true });
    };
    const close = this.button(panel, 'CLOSE', 'mini closer', closePanel);
    close.setAttribute('aria-label', 'Close');
    const show = this.tabs(panel, buildControlsPanel(this.touch), this.makeSettingsPanel(), 'controls');
    const showTab = (w: 'controls' | 'settings'): void => {
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

    // ---- the side menu ----
    const rail = el('nav', 'ds-l-rail', root);
    rail.setAttribute('aria-label', 'Main menu');
    const brand = el('div', 'ds-l-brand', rail);
    el('span', 'l1', brand, 'DEAD SIGNAL');
    el('span', 'l2', brand, 'EXCLUSION ZONE');
    const nav = el('div', 'ds-l-nav', rail);
    const item = (label: string, glyph: NavGlyph, on: boolean, go: () => void): HTMLButtonElement => {
      const b = this.button(nav, '', on ? 'ds-l-item on' : 'ds-l-item', go);
      b.appendChild(navIcon(glyph));
      el('span', '', b, label);
      // on a phone held upright only the icon shows: the name stays with the button
      b.setAttribute('aria-label', label);
      if (on) b.setAttribute('aria-current', 'page');
      return b;
    };
    item('PLAY', 'play', !boards && !coop && !roam, () => this.goPage('play'));
    item('WITH FRIENDS', 'friends', !boards && coop, () => this.goPage('friends'));
    item('EXPLORE', 'explore', !boards && roam, () => this.goPage('explore'));
    item('LEADERBOARDS', 'trophy', boards, () => this.goPage('boards'));
    item('BESTIARY', 'book', false, () => window.open('./bestiary.html', '_blank', 'noopener'));
    item('CONTROLS', 'keys', false, () => showTab('controls'));
    item('SETTINGS', 'sliders', false, () => showTab('settings'));

    const foot = el('div', 'ds-l-foot', rail);
    const bestEl = el('div', 'ds-l-best', foot);
    if (best) {
      el('span', 'lbl', bestEl, 'YOUR BEST EXTRACTION');
      el('span', 'val', bestEl, fmtClock(best.time));
      el('span', 'sub', bestEl, `${fmtInt(best.kills)} kills · ${fmtInt(best.headshots)} headshots`);
    } else {
      el('span', 'lbl', bestEl, 'YOUR BEST EXTRACTION');
      el('span', 'sub', bestEl, 'None yet - your first one shows here.');
    }
    // the graphics preset, in plain sight: one tap opens Settings to change it
    this.qualityChip = this.button(foot, '', 'quality', () => showTab('settings'));
    this.qualityChip.title = 'Graphics quality - open Settings to change it';
    this.syncQualityChip();
    if (this.account.online && !this.locked) {
      const acct = el('div', 'ds-l-acct', foot);
      if (this.account.avatar) {
        const img = el('img', 'avatar', acct);
        img.src = this.account.avatar;
        img.alt = '';
      } else el('span', 'avatar', acct, (this.account.name ?? '?').slice(0, 1).toUpperCase());
      const who = el('div', 'who', acct);
      el('b', '', who, this.account.name ?? '');
      const tools = el('div', 'tools', who);
      if (this.account.admin) {
        const link = el('a', 'lnk', tools, 'Admin');
        link.href = '/admin';
      }
      const out = this.button(tools, 'Sign out', 'lnk', () => this.cb.onLogout());
      out.classList.remove('ds-btn');
    }

    // ---- the page ----
    const main = el('main', 'ds-l-main', root);
    let first: HTMLElement | null = null;
    if (boards) this.buildBoards(main);
    else {
      const hero = el('section', 'ds-l-hero', main);
      const kick = el('div', 'kicker', hero);
      el('span', 'haz', kick);
      el('span', '', kick, coop ? 'WITH FRIENDS  //  UP TO THREE PLAYERS' : roam ? 'EXPLORE  //  NO MISSION, NO DAMAGE' : text.kicker);
      el('h1', 'name', hero, text.name);
      el('p', 'tag', hero, text.tagline);
      el('p', 'lead', hero, coop ? COOP_LEAD : roam ? ROAM_NOTE : PLAY_LEAD);

      const cta = el('div', 'ds-l-cta', hero);
      if (this.locked) {
        const b = this.button(cta, '', 'primary big discord', () => window.location.assign(this.account.loginUrl));
        const mark = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, b);
        svgEl('path', { d: DISCORD_MARK, fill: 'currentColor' }, mark);
        el('span', '', b, 'SIGN IN WITH DISCORD TO PLAY');
        const why = el('div', 'why', cta);
        el('b', '', why, this.account.loginFailed ? 'SIGN-IN DID NOT COMPLETE - TRY AGAIN' : 'FREE, RIGHT HERE IN YOUR BROWSER');
        el('span', '', why, 'One click. Only your Discord name and avatar are read.');
        first = b;
      } else {
        const go = this.button(cta, roam ? 'EXPLORE' : coop ? 'OPEN LOBBY' : 'PLAY', 'primary big', () => this.deploy());
        go.setAttribute('aria-label', roam ? `Explore ${text.name}` : coop ? 'Open the co-op lobby' : `Play ${text.name}`);
        first = go;
        if (!roam) {
          const d = this.info.difficulty;
          this.picker(cta, 'DIFFICULTY', ZOMBIE_DIFFICULTIES.map((id) => ({ id, label: ZOMBIE_DIFFICULTY[id].label, note: ZOMBIE_DIFFICULTY[id].note })), d.zombies, (id) => this.cb.onDifficultyChange({ ...d, zombies: id as typeof d.zombies }));
          const more = this.button(cta, this.moreOpen ? 'FEWER OPTIONS' : 'MORE OPTIONS', 'ghost', () => {
            this.moreOpen = !this.moreOpen;
            this.showTitle(this.lastBest);
            this.screen?.querySelector<HTMLElement>('.ds-l-cta .ghost')?.focus({ preventScroll: true });
          });
          more.setAttribute('aria-expanded', this.moreOpen ? 'true' : 'false');
        }
      }
      if (!this.locked && !roam && this.moreOpen) {
        const d = this.info.difficulty;
        const opts = el('div', 'ds-l-more', hero);
        this.picker(opts, 'SQUAD AI', TEAM_SKILLS.map((id) => ({ id, label: TEAM_SKILL[id].label, note: TEAM_SKILL[id].note })), d.team, (id) => this.cb.onDifficultyChange({ ...d, team: id as typeof d.team }));
        if (coop) el('span', 'hint', opts, 'These are the defaults for a lobby you open; its owner can change them there.');
        else {
          const hunt = mode === 'cards';
          const t = this.button(opts, hunt ? 'MAZOKU CARD HUNT  ON' : 'MAZOKU CARD HUNT  OFF', hunt ? 'toggle on' : 'toggle', () => this.cb.onModeChange(hunt ? 'standard' : 'cards'));
          t.setAttribute('aria-pressed', hunt ? 'true' : 'false');
          el('span', 'hint', opts, 'Adds five card carriers to put down and collect, on top of the mission.');
        }
      }
      el(
        'p',
        'ds-l-note',
        hero,
        this.locked ? 'You can look around the menu first: the zones, the leaderboards and the bestiary are open to everyone.' : this.touch ? 'Play goes fullscreen. Tap II at any time to pause.' : 'Press Enter to play. Esc pauses at any time.',
      );

      // ---- below: the zones, and what you do on this one ----
      const below = el('div', 'ds-l-below', main);
      const zones = el('section', 'ds-l-zones', below);
      el('h2', '', zones, 'ZONES');
      const list = el('div', 'list', zones);
      list.setAttribute('role', 'radiogroup');
      list.setAttribute('aria-label', 'Zone');
      const locked = this.info.lockedMap ?? null;
      for (const id of MAP_IDS) {
        const on = id === this.info.map;
        const z = this.button(list, '', on ? 'ds-l-zone on' : 'ds-l-zone', () => {
          if (!on) this.cb.onMapChange(id);
        });
        z.dataset.map = id;
        z.setAttribute('role', 'radio');
        z.setAttribute('aria-checked', on ? 'true' : 'false');
        el('span', 'zn', z, MAP_TEXT[id].name);
        el('span', 'zt', z, MAP_TEXT[id].tagline);
        if (on) el('span', 'zon', z, 'SELECTED');
        if (locked && !on) {
          z.disabled = true;
          z.title = 'Leave the co-op session to change the map';
        }
      }
      const brief = el('section', 'ds-l-brief', below);
      el('h2', '', brief, roam ? 'THE MISSION, FOR LATER' : 'WHAT YOU DO HERE');
      const rows = MAP_TEXT[this.info.map].rows;
      // the card hunt goes in before the extraction (the last row)
      const briefRows = mode === 'cards' ? [...rows.slice(0, -1), CARD_BRIEF, rows[rows.length - 1]!] : rows;
      const ol = el('ol', '', brief);
      for (const r of briefRows) {
        const li = el('li', '', ol);
        el('b', '', li, r.title);
        el('span', '', li, r.text);
      }
    }

    this.setScreen('title', root);
    (first ?? this.screen?.querySelector<HTMLElement>('.ds-l-item.on'))?.focus({ preventScroll: true });
  }

  // -------------------------------------------------------------------------------------------
  // leaderboards (a page of the title)
  // -------------------------------------------------------------------------------------------

  private buildBoards(main: HTMLElement): void {
    main.replaceChildren();
    const q = this.board;
    const page = el('section', 'ds-l-boards', main);
    el('h1', 'name', page, 'LEADERBOARDS');
    el('p', 'lead', page, 'The best runs on each zone. Pick a zone, how it was played and what to rank by.');
    const filters = el('div', 'filters', page);
    const seg = (label: string, options: readonly { id: string; label: string }[], current: string, pick: (id: string) => void): void => {
      const g = el('div', 'seg', filters);
      g.setAttribute('role', 'radiogroup');
      g.setAttribute('aria-label', label);
      el('span', 'lbl', g, label);
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
    seg('ZONE', MAP_IDS.map((id) => ({ id, label: MAP_TEXT[id].name.replace(/^THE /, '') })), q.map, (id) => (q.map = id as MapId));
    seg('PLAYED', BOARD_MODES, q.mode, (id) => (q.mode = id as BoardQuery['mode']));
    seg('RANK BY', BOARD_METRICS, q.metric, (id) => (q.metric = id as BoardQuery['metric']));
    const selects = el('div', 'selects', filters);
    const select = (label: string, options: { id: string; label: string }[], current: string, pick: (v: string) => void): HTMLSelectElement => {
      const wrap = el('label', 'sel', selects);
      el('span', 'lbl', wrap, label);
      const s = el('select', '', wrap);
      for (const o of options) {
        const op = el('option', '', s, o.label);
        op.value = o.id;
        if (o.id === current) op.selected = true;
      }
      s.addEventListener('change', () => {
        pick(s.value);
        this.loadBoard(table);
      });
      return s;
    };
    const versionSel = select('VERSION', [{ id: '', label: 'Every version' }], q.version, (v) => (q.version = v));
    select('DIFFICULTY', [{ id: '', label: 'Every difficulty' }, ...ZOMBIE_DIFFICULTIES.map((id) => ({ id, label: sentence(ZOMBIE_DIFFICULTY[id].label) }))], q.difficulty, (v) => (q.difficulty = v));
    const table = el('div', 'table', page);
    table.dataset.versions = '';
    this.loadBoard(table, versionSel);
  }

  /** Fetch the board the filters describe and draw it (a stale answer is dropped). */
  private loadBoard(table: HTMLElement, versionSel?: HTMLSelectElement): void {
    const q = this.board;
    const req = ++this.boardReq;
    table.replaceChildren();
    if (!this.account.online) {
      el('p', 'empty', table, 'Leaderboards need the game server - they show on the live site.');
      return;
    }
    el('p', 'empty', table, 'Loading...');
    const params = new URLSearchParams({ map: q.map, mode: q.mode, metric: q.metric });
    if (q.version) params.set('version', q.version);
    if (q.difficulty) params.set('difficulty', q.difficulty);
    void fetch(`/api/leaderboards?${params}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<BoardReply>) : null))
      .catch(() => null)
      .then((data) => {
        if (req !== this.boardReq || !table.isConnected) return;
        table.replaceChildren();
        if (!data) {
          el('p', 'empty', table, 'The leaderboards could not be loaded. Try again in a moment.');
          return;
        }
        if (versionSel && versionSel.options.length === 1) {
          for (const v of data.versions ?? []) {
            const op = el('option', '', versionSel, `v${v}`);
            op.value = v;
            if (v === q.version) op.selected = true;
          }
        }
        if (!data.enabled) {
          el('p', 'empty', table, data.all === false ? 'The leaderboards are switched off for now.' : 'This board is switched off for now.');
          return;
        }
        if (!data.entries.length) {
          el('p', 'empty', table, 'No runs on this board yet. Yours could be the first.');
          return;
        }
        const t = el('table', '', table);
        const head = el('tr', '', el('thead', '', t));
        for (const h of ['#', 'PLAYER', BOARD_METRICS.find((m) => m.id === q.metric)!.label, 'VERSION', 'DATE']) el('th', '', head, h);
        const body = el('tbody', '', t);
        for (const e of data.entries) {
          const tr = el('tr', e.rank <= 3 ? `top${e.rank}` : '', body);
          el('td', 'rk', tr, String(e.rank));
          const who = el('td', 'who', tr);
          if (e.avatar) {
            const img = el('img', '', who);
            img.src = e.avatar;
            img.alt = '';
            img.loading = 'lazy';
          } else el('span', 'av', who, (e.name || '?').slice(0, 1).toUpperCase());
          el('span', '', who, e.name);
          el('td', 'val', tr, q.metric === 'fastest' ? fmtClock(e.value) : fmtInt(e.value));
          el('td', 'ver', tr, e.version ? `v${e.version}` : '-');
          el('td', 'day', tr, e.day ?? '');
        }
      });
  }

  // -------------------------------------------------------------------------------------------
  // pause + resume
  // -------------------------------------------------------------------------------------------

  showPause(): void {
    this.clearScreen();
    const root = el('div', '');
    el('div', 'ds-scrim', root);
    const panel = el('div', 'ds-pause-panel ds-panel ds-brk', root);
    const head = el('div', 'ds-panel-head big', panel);
    el('span', '', head, 'MISSION SUSPENDED');
    el('span', 'aux', head, 'PAUSED');
    this.tabs(panel, buildControlsPanel(this.touch), this.makeSettingsPanel(), 'controls');
    const actions = el('div', 'actions', panel);
    const resume = this.button(actions, 'RESUME', 'primary', () => this.cb.onResume());
    this.confirmButton(actions, 'RESTART MISSION', '', () => this.cb.onRestart());
    this.confirmButton(actions, 'QUIT TO TITLE', '', () => this.cb.onQuitToTitle());
    this.setScreen('pause', root);
    resume.focus({ preventScroll: true });
  }

  showResumePrompt(reason: string, withMenu = false, text: { title?: string; note?: string } = {}): void {
    this.clearScreen();
    const root = el('div', '');
    el('div', 'ds-scrim light', root);
    const box = el('div', 'ds-resume-box ds-panel ds-brk', root);
    el('div', 'ttl', box, text.title ?? 'SIGNAL INTERRUPTED');
    el('div', 'why', box, reason);
    const btn = this.button(box, text.title ? (this.touch ? 'TAP TO JOIN' : 'CLICK TO JOIN') : this.touch ? 'TAP TO RESUME' : 'CLICK TO RESUME', 'primary', () => this.cb.onResume());
    const menu = withMenu ? this.button(box, 'SETTINGS AND OPTIONS', '', () => this.showPause()) : null;
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
    cell('MYSTERY BOXES', fmtInt(stats.cratesOpened));
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
