/**
 * Menus: title, pause, resume prompt, results, error and loading screens. Screens are rebuilt on show (never per
 * frame). The DEPLOY / RESUME callbacks are invoked SYNCHRONOUSLY from the input event handler so the game can
 * request pointer lock and start audio inside the user gesture.
 */
import './styles.css';
import { DEFAULT_SETTINGS, REGIONS, TEAM_SKILL, TEAM_SKILLS, ZOMBIE_DIFFICULTIES, ZOMBIE_DIFFICULTY } from '../config';
import type { BestRun, GameMode, MissionStats, Settings } from '../types';
import { MAP_TEXT } from '../world/layout/data';
import { el, fmtClock, fmtInt, fmtMoney, svgEl } from './dom';
import type { AccountInfo, MenuCallbacks, MenusApi, ModeInfo } from './hudTypes';
import { icon } from './icons';
import { setReducedMotionSetting } from './prefs';
import { type SettingsPanel, buildControlsPanel, buildSettingsPanel } from './settingsPanel';

type ScreenKind = 'title' | 'pause' | 'resume' | 'results' | 'error';


const CARD_BRIEF = {
  tag: 'SIDE CONTRACT',
  title: 'MAZOKU CARRIERS',
  text: 'Five card carriers walk the district. They cannot be killed: put one down, purge the signal, take the card.',
};

const MODES: { id: GameMode; label: string; note: string }[] = [
  { id: 'standard', label: 'STANDARD', note: 'The operation as briefed.' },
  { id: 'cards', label: 'STANDARD MAZOKU', note: 'The standard operation, plus five Mazoku card carriers to put down, purge and collect.' },
  { id: 'roam', label: 'FREE ROAM', note: 'No mission and no damage. Fly anywhere and look around.' },
  { id: 'coop', label: 'CO-OP', note: 'Up to three players run this map together: Standard, Standard Mazoku or Free Roam. Revive anyone who goes down, then extract together.' },
];

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

  private pushSetting(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
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

  showTitle(best: BestRun | null): void {
    this.clearScreen();
    this.lastBest = best;
    const mode = this.info.mode;
    const root = el('div', '');
    el('div', 'ds-shade', root);
    el('div', 'ds-scanlines', root);

    // ---- left: title block ----
    const main = el('div', 'ds-title-main', root);
    const kicker = el('div', 'kicker', main);
    el('span', 'haz', kicker);
    const text = MAP_TEXT[this.info.map];
    el('span', '', kicker, text.kicker);
    const h1 = el('h1', 'name', main);
    el('span', 'l1', h1, 'DEAD SIGNAL');
    el('span', 'l2', h1, 'EXCLUSION ZONE');
    const sig = el('div', 'sigline', main);
    for (let i = 0; i < 5; i++) el('i', '', sig);
    el('span', '', sig, text.signal);
    el(
      'p',
      'premise',
      main,
      text.premise,
    );

    // ---- account: its own row, first, because nothing else works without it ----
    let signInBtn: HTMLButtonElement | null = null;
    if (this.account.online) {
      const acct = el('div', this.locked ? 'acct out' : 'acct', main);
      if (this.locked) {
        signInBtn = this.button(acct, '', 'discord', () => window.location.assign(this.account.loginUrl));
        const mark = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, signInBtn);
        svgEl('path', { d: DISCORD_MARK, fill: 'currentColor' }, mark);
        el('span', '', signInBtn, 'SIGN IN WITH DISCORD');
        const why = el('div', 'why', acct);
        el('b', '', why, this.account.loginFailed ? 'SIGN-IN DID NOT COMPLETE - TRY AGAIN' : 'STEP 1  -  SIGN IN TO PLAY');
        el('span', '', why, 'Only your Discord name and avatar are read.');
      } else {
        if (this.account.avatar) {
          const img = el('img', 'avatar', acct);
          img.src = this.account.avatar;
          img.alt = '';
        } else {
          el('span', 'avatar', acct, (this.account.name ?? '?').slice(0, 1).toUpperCase());
        }
        const who = el('div', 'who', acct);
        el('span', 'lbl', who, 'SIGNED IN');
        el('b', '', who, this.account.name ?? '');
        const tools = el('div', 'tools', acct);
        if (this.account.admin) {
          const link = el('a', 'ds-btn', tools, 'ADMIN DASHBOARD');
          link.href = '/admin';
        }
        this.button(tools, 'SIGN OUT', '', () => this.cb.onLogout());
      }
    }

    // ---- which map ----
    const maps = el('div', 'modes', main);
    el('span', 'lbl', maps, 'MAP');
    const mapSeg = el('div', 'seg', maps);
    for (const id of ['district', 'forge'] as const) {
      const b = this.button(mapSeg, MAP_TEXT[id].name, id === this.info.map ? 'on' : '', () => {
        if (id !== this.info.map) this.cb.onMapChange(id);
      });
      b.setAttribute('aria-pressed', id === this.info.map ? 'true' : 'false');
    }

    // ---- what DEPLOY starts ----
    const modes = el('div', 'modes', main);
    el('span', 'lbl', modes, 'MODE');
    const seg = el('div', 'seg', modes);
    seg.setAttribute('role', 'radiogroup');
    for (const m of MODES) {
      const b = this.button(seg, m.label, m.id === mode ? 'on' : '', () => {
        if (m.id !== this.info.mode) this.cb.onModeChange(m.id);
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', m.id === mode ? 'true' : 'false');
    }
    el('div', 'modenote', main, MODES.find((m) => m.id === mode)!.note);

    // ---- difficulty: the infected and the AI squad, picked separately (nothing to fight in free roam) ----
    if (mode !== 'roam') {
      const d = this.info.difficulty;
      const row = (label: string, ids: readonly string[], on: string, name: (id: string) => string, note: (id: string) => string, pick: (id: string) => void): void => {
        const r = el('div', 'modes diff', main);
        el('span', 'lbl', r, label);
        const s = el('div', 'seg', r);
        s.setAttribute('role', 'radiogroup');
        s.setAttribute('aria-label', label);
        for (const id of ids) {
          const b = this.button(s, name(id), id === on ? 'on' : '', () => {
            if (id !== on) pick(id);
          });
          b.title = note(id);
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', id === on ? 'true' : 'false');
        }
      };
      row('INFECTED', ZOMBIE_DIFFICULTIES, d.zombies, (id) => ZOMBIE_DIFFICULTY[id as keyof typeof ZOMBIE_DIFFICULTY].label, (id) => ZOMBIE_DIFFICULTY[id as keyof typeof ZOMBIE_DIFFICULTY].note, (id) => this.cb.onDifficultyChange({ ...d, zombies: id as typeof d.zombies }));
      row('SQUAD AI', TEAM_SKILLS, d.team, (id) => TEAM_SKILL[id as keyof typeof TEAM_SKILL].label, (id) => TEAM_SKILL[id as keyof typeof TEAM_SKILL].note, (id) => this.cb.onDifficultyChange({ ...d, team: id as typeof d.team }));
      el('div', 'modenote', main, mode === 'coop' ? 'Co-op: these are the defaults for a session you create; its owner can change them in the lobby.' : `${ZOMBIE_DIFFICULTY[d.zombies].note} ${TEAM_SKILL[d.team].note}`);
    }

    const actions = el('div', 'actions', main);
    const deployBtn = this.button(actions, mode === 'roam' ? 'FLY' : mode === 'coop' ? 'LOBBY' : 'DEPLOY', 'primary big', () => this.deploy());
    deployBtn.setAttribute('aria-label', mode === 'roam' ? 'Fly around the exclusion zone' : 'Deploy into the exclusion zone');
    deployBtn.disabled = this.locked;
    let showTab: (w: 'controls' | 'settings') => void = () => {};
    this.button(actions, 'SETTINGS', '', () => showTab('settings'));
    this.button(actions, 'CONTROLS', '', () => showTab('controls'));
    // every infected (and the people beside you) in 3D, on its own page
    this.button(actions, 'BESTIARY', '', () => window.open('./bestiary.html', '_blank', 'noopener'));
    el(
      'div',
      'note',
      main,
      this.locked ? 'Sign in above to unlock deployment.' : this.touch ? 'Deploy goes fullscreen. Tap II at any time to pause.' : 'Deploy captures the mouse. Press ESC at any time to pause.',
    );

    const bestEl = el('div', 'best', main);
    if (best) {
      el('span', 'lbl', bestEl, 'BEST EXTRACTION');
      el('span', 'val', bestEl, fmtClock(best.time));
      el(
        'span',
        'sub',
        bestEl,
        `${fmtInt(best.kills)} KILLS  /  ${fmtInt(best.headshots)} HEADSHOTS  /  ${fmtMoney(best.cash)}  /  ${best.date.slice(0, 10)}`,
      );
    } else {
      el('span', 'lbl', bestEl, 'SERVICE RECORD');
      el('span', 'sub', bestEl, 'NO SUCCESSFUL EXTRACTIONS ON FILE');
    }

    // ---- right: brief + tabbed controls/settings ----
    const side = el('div', 'ds-title-side', root);
    const brief = el('div', 'ds-brief ds-panel ds-brk', side);
    const bh = el('div', 'ds-panel-head', brief);
    el('span', '', bh, 'OPERATION BRIEF');
    el('span', 'aux', bh, 'PRIORITY ALPHA');
    const rows = MAP_TEXT[this.info.map].rows;
    const briefRows = mode === 'cards' ? [rows[0]!, rows[1]!, CARD_BRIEF, rows[2]!] : rows;
    for (let i = 0; i < briefRows.length; i++) {
      const item = briefRows[i]!;
      const row = el('div', 'row', brief);
      el('span', 'n', row, String(i + 1));
      const body = el('div', 'body', row);
      const tt = el('div', 't', body);
      el('span', 'tag', tt, item.tag);
      el('span', 'title', tt, item.title);
      el('div', 'text', body, item.text);
    }
    el('div', 'foot', brief, text.foot);

    const panel = el('div', 'ds-sidepanel ds-panel ds-brk', side);
    showTab = this.tabs(panel, buildControlsPanel(this.touch), this.makeSettingsPanel(), 'controls');

    el('div', 'ds-title-foot', root, `DEAD SIGNAL: EXCLUSION ZONE  //  SINGLE-PLAYER  //  ${this.touch ? 'TOUCH CONTROLS' : 'KEYBOARD AND MOUSE'}`);

    this.setScreen('title', root);
    (signInBtn ?? deployBtn).focus({ preventScroll: true });
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
