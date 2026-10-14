/**
 * Menus: title, pause, resume prompt, results, error and loading screens. Screens are rebuilt on show (never per
 * frame). The DEPLOY / RESUME callbacks are invoked SYNCHRONOUSLY from the input event handler so the game can
 * request pointer lock and start audio inside the user gesture.
 */
import './styles.css';
import { DEFAULT_SETTINGS, REGIONS } from '../config';
import type { BestRun, GameMode, MissionStats, Settings } from '../types';
import { el, fmtClock, fmtInt, fmtMoney } from './dom';
import type { AccountInfo, MenuCallbacks, MenusApi, ModeInfo } from './hudTypes';
import { icon } from './icons';
import { setReducedMotionSetting } from './prefs';
import { type SettingsPanel, buildControlsPanel, buildSettingsPanel } from './settingsPanel';

type ScreenKind = 'title' | 'pause' | 'resume' | 'results' | 'error';

const BRIEF: { tag: string; title: string; text: string }[] = [
  {
    tag: 'CONTRACT ALPHA',
    title: 'RESTORE THE RELAY',
    text: 'Activate the depot transmitter and hold the marked area while the uplink completes.',
  },
  {
    tag: 'CONTRACT BRAVO',
    title: 'ELIMINATE THE WARDEN',
    text: 'Locate and kill the elite infected inside the research compound.',
  },
  {
    tag: 'EXTRACT',
    title: 'LZ ECHO',
    text: 'Radio the helicopter, survive the final horde and board before the district seals.',
  },
];

const CARD_BRIEF = {
  tag: 'SIDE CONTRACT',
  title: 'RECOVER THE CARDS',
  text: 'Five carriers walk the district. They cannot be killed: put one down, purge the signal, take the card.',
};

const MODES: { id: GameMode; label: string; note: string }[] = [
  { id: 'standard', label: 'STANDARD', note: 'The operation as briefed.' },
  { id: 'cards', label: 'CARD RECOVERY', note: 'The same operation, with five card carriers to put down, purge and collect.' },
  { id: 'roam', label: 'FREE ROAM', note: 'No mission and no damage. Fly anywhere and look around.' },
];

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
  private info: ModeInfo = { mode: 'standard', cards: [] };
  private lastBest: BestRun | null = null;
  private account: AccountInfo = { online: false, name: null, admin: false, loginUrl: '', loginFailed: false };
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
    el('span', '', kicker, 'SECTOR 7  //  QUARANTINE PERIMETER  //  BLUE HOUR');
    const h1 = el('h1', 'name', main);
    el('span', 'l1', h1, 'DEAD SIGNAL');
    el('span', 'l2', h1, 'EXCLUSION ZONE');
    const sig = el('div', 'sigline', main);
    for (let i = 0; i < 5; i++) el('i', '', sig);
    el('span', '', sig, 'NO CARRIER  -  LAST KNOWN POSITION: RESEARCH COMPOUND');
    el(
      'p',
      'premise',
      main,
      'The district has been sealed for nine days. Insert at the checkpoint, clear two contracts, call the bird, and get out before the surge takes the landing zone.',
    );

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

    const actions = el('div', 'actions', main);
    const deployBtn = this.locked
      ? this.button(actions, 'SIGN IN WITH DISCORD', 'primary big', () => window.location.assign(this.account.loginUrl))
      : this.button(actions, mode === 'roam' ? 'FLY' : 'DEPLOY', 'primary big', () => this.deploy());
    if (!this.locked) deployBtn.setAttribute('aria-label', mode === 'roam' ? 'Fly around the exclusion zone' : 'Deploy into the exclusion zone');
    let showTab: (w: 'controls' | 'settings') => void = () => {};
    this.button(actions, 'SETTINGS', '', () => showTab('settings'));
    this.button(actions, 'CONTROLS', '', () => showTab('controls'));
    if (this.locked) {
      el('div', 'note', main, this.account.loginFailed ? 'SIGN-IN DID NOT COMPLETE. TRY AGAIN.' : 'A Discord account is needed to play. Only your name and avatar are read.');
    } else {
      el('div', 'note', main, this.touch ? 'Deploy goes fullscreen. Tap II at any time to pause.' : 'Deploy captures the mouse. Press ESC at any time to pause.');
    }
    if (this.account.name !== null) {
      const acct = el('div', 'acct', main);
      el('span', 'lbl', acct, 'SIGNED IN AS');
      el('span', 'who', acct, this.account.name);
      if (this.account.admin) {
        const a = el('a', 'ds-btn', acct, 'ADMIN');
        a.href = '/admin';
      }
      this.button(acct, 'SIGN OUT', '', () => this.cb.onLogout());
    }

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
    const briefRows = mode === 'cards' ? [BRIEF[0]!, BRIEF[1]!, CARD_BRIEF, BRIEF[2]!] : BRIEF;
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
    if (mode === 'cards' && this.info.cards.length > 0) {
      // the collection: recovered cards in full, the rest as dark blanks
      const owned = this.info.cards.filter((c) => c.owned).length;
      const coll = el('div', 'cards', brief);
      el('div', 'lbl', coll, `ARCHIVE  ${owned} / ${this.info.cards.length} RECOVERED`);
      const strip = el('div', 'strip', coll);
      for (const c of this.info.cards) {
        const slot = el('div', c.owned ? 'card owned' : 'card', strip);
        slot.style.setProperty('--cc', c.accent);
        slot.title = c.owned ? `${c.name} - ${c.series} (recovered ${c.count} ${c.count === 1 ? 'time' : 'times'})` : 'Not recovered yet';
        const img = el('img', '', slot);
        img.src = c.image;
        img.alt = c.owned ? c.name : 'Unrecovered card';
        img.draggable = false;
        if (c.count > 1) el('span', 'n', slot, `x${c.count}`);
      }
    } else {
      el('div', 'foot', brief, 'Loot caches, buy gear and upgrade weapons along the way. A contamination surge closes in late in the mission.');
    }

    const panel = el('div', 'ds-sidepanel ds-panel ds-brk', side);
    showTab = this.tabs(panel, buildControlsPanel(this.touch), this.makeSettingsPanel(), 'controls');

    el('div', 'ds-title-foot', root, `DEAD SIGNAL: EXCLUSION ZONE  //  SINGLE-PLAYER  //  ${this.touch ? 'TOUCH CONTROLS' : 'KEYBOARD AND MOUSE'}`);

    this.setScreen('title', root);
    deployBtn.focus({ preventScroll: true });
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

  showResumePrompt(reason: string, withMenu = false): void {
    this.clearScreen();
    const root = el('div', '');
    el('div', 'ds-scrim light', root);
    const box = el('div', 'ds-resume-box ds-panel ds-brk', root);
    el('div', 'ttl', box, 'SIGNAL INTERRUPTED');
    el('div', 'why', box, reason);
    const btn = this.button(box, this.touch ? 'TAP TO RESUME' : 'CLICK TO RESUME', 'primary', () => this.cb.onResume());
    const menu = withMenu ? this.button(box, 'SETTINGS AND OPTIONS', '', () => this.showPause()) : null;
    el('div', 'note', box, 'The simulation is frozen until you resume.');
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
    cell('SUPPLY CACHES', fmtInt(stats.cratesOpened));
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
