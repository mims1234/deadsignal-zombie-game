/** Local persistence for settings and the best successful run. Every access is guarded: storage failure never blocks play. */
import { asMapId, type MapId } from './world/layout/data';
import { DEFAULT_SETTINGS, TEAM_SKILLS, ZOMBIE_DIFFICULTIES, type TeamSkill, type ZombieDifficulty } from './config';
import type { BestRun, GameMode, QualityLevel, Settings } from './types';

const KEY_SETTINGS = 'deadsignal.settings.v1';
const KEY_BEST = 'deadsignal.best.v1';
const KEY_MODE = 'deadsignal.mode.v1';
const KEY_CARDS = 'deadsignal.cards.v1';
const KEY_MAP = 'deadsignal.map.v1';

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const q = r.quality;
  const quality: QualityLevel = q === 'low' || q === 'medium' || q === 'high' ? q : DEFAULT_SETTINGS.quality;
  return {
    sensitivity: clamp(r.sensitivity, 0.1, 4, DEFAULT_SETTINGS.sensitivity),
    fov: clamp(r.fov, 70, 110, DEFAULT_SETTINGS.fov),
    masterVolume: clamp(r.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
    quality,
    reducedMotion: typeof r.reducedMotion === 'boolean' ? r.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
    invertY: typeof r.invertY === 'boolean' ? r.invertY : DEFAULT_SETTINGS.invertY,
    showFps: typeof r.showFps === 'boolean' ? r.showFps : DEFAULT_SETTINGS.showFps,
    aimAssist: typeof r.aimAssist === 'boolean' ? r.aimAssist : DEFAULT_SETTINGS.aimAssist,
    autoFire: typeof r.autoFire === 'boolean' ? r.autoFire : DEFAULT_SETTINGS.autoFire,
  };
}

export function loadSettings(): Settings {
  let s = { ...DEFAULT_SETTINGS };
  try {
    const txt = window.localStorage.getItem(KEY_SETTINGS);
    if (txt) s = sanitizeSettings(JSON.parse(txt));
  } catch {
    /* storage unavailable or corrupt: defaults */
  }
  // honour the OS reduced-motion preference on first run
  try {
    if (window.localStorage.getItem(KEY_SETTINGS) === null && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) s.reducedMotion = true;
  } catch {
    /* ignore */
  }
  return s;
}

/** False on a first visit (or when storage is unavailable), which is when device-appropriate defaults apply. */
export function hasStoredSettings(): boolean {
  try {
    return window.localStorage.getItem(KEY_SETTINGS) !== null;
  } catch {
    return false;
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadBest(): BestRun | null {
  try {
    const txt = window.localStorage.getItem(KEY_BEST);
    if (!txt) return null;
    const r = JSON.parse(txt) as Partial<BestRun>;
    if (typeof r.time !== 'number' || !Number.isFinite(r.time)) return null;
    return {
      time: r.time,
      kills: typeof r.kills === 'number' ? r.kills : 0,
      headshots: typeof r.headshots === 'number' ? r.headshots : 0,
      cash: typeof r.cash === 'number' ? r.cash : 0,
      date: typeof r.date === 'string' ? r.date : '',
    };
  } catch {
    return null;
  }
}

export function saveBest(b: BestRun): void {
  try {
    window.localStorage.setItem(KEY_BEST, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

/** Is `candidate` a better successful run than `best`? Faster time wins; ties broken by kills. */
export function isBetterRun(candidate: BestRun, best: BestRun | null): boolean {
  if (!best) return true;
  if (candidate.time < best.time - 0.5) return true;
  return Math.abs(candidate.time - best.time) <= 0.5 && candidate.kills > best.kills;
}

export function loadMode(): GameMode {
  try {
    const m = window.localStorage.getItem(KEY_MODE);
    return m === 'cards' || m === 'roam' ? m : 'standard';
  } catch {
    return 'standard';
  }
}

export function loadMap(): MapId {
  try {
    return asMapId(window.localStorage.getItem(KEY_MAP));
  } catch {
    return 'district';
  }
}

export function saveMap(map: MapId): void {
  try {
    window.localStorage.setItem(KEY_MAP, map);
  } catch {
    /* ignore */
  }
}

const KEY_DIFFICULTY = 'deadsignal.difficulty.v1';

/** The two difficulty choices (the infected, the AI squad). */
export function loadDifficulty(): { zombies: ZombieDifficulty; team: TeamSkill } {
  try {
    const d = JSON.parse(window.localStorage.getItem(KEY_DIFFICULTY) || '{}') as { zombies?: string; team?: string };
    return {
      zombies: (ZOMBIE_DIFFICULTIES as readonly string[]).includes(d.zombies ?? '') ? (d.zombies as ZombieDifficulty) : 'normal',
      team: (TEAM_SKILLS as readonly string[]).includes(d.team ?? '') ? (d.team as TeamSkill) : 'regular',
    };
  } catch {
    return { zombies: 'normal', team: 'regular' };
  }
}

export function saveDifficulty(d: { zombies: ZombieDifficulty; team: TeamSkill }): void {
  try {
    window.localStorage.setItem(KEY_DIFFICULTY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

const KEY_ROAM_BASE = 'deadsignal.roamBase.v1';

/** Free roam is an option on Standard or Standard Mazoku: the one it was switched on from. */
export function loadRoamBase(): 'standard' | 'cards' {
  try {
    return window.localStorage.getItem(KEY_ROAM_BASE) === 'cards' ? 'cards' : 'standard';
  } catch {
    return 'standard';
  }
}

export function saveRoamBase(base: 'standard' | 'cards'): void {
  try {
    window.localStorage.setItem(KEY_ROAM_BASE, base);
  } catch {
    /* ignore */
  }
}

export function saveMode(mode: GameMode): void {
  try {
    window.localStorage.setItem(KEY_MODE, mode);
  } catch {
    /* ignore */
  }
}

/** Ids of the cards recovered across every run. Unknown or duplicate ids are dropped. */
export function loadCards(known: readonly string[]): string[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY_CARDS) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return known.filter((id) => raw.includes(id));
  } catch {
    return [];
  }
}

export function saveCards(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(KEY_CARDS, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}
