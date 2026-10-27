/**
 * The player's account and everything the game reports to the server: visits, runs and recovered cards.
 * Every call is best-effort. When there is no server behind the page (a plain static host, or the Vite dev server
 * on its own) `online` is false and the game runs as a local, signed-out build that reports nothing.
 */
import { GATED_MAPS, MAP_IDS, asMapId, type MapId } from '../world/layout/data';
import { GATED_FILMS, lockedFilmsFrom, type FilmId } from '../films';
import type { GameMode, MissionStats, QualityLevel } from '../types';
import type { DeviceClass, GpuVendor } from '../render/device';

export interface AccountUser {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
}

export interface Account {
  /** A game server answered. */
  online: boolean;
  user: AccountUser | null;
  admin: boolean;
  banned: boolean;
  banReason: string;
  /** Times each card has been recovered, by card id. */
  cards: Record<string, number>;
  /** Where the sign-in button goes. */
  loginUrl: string;
  /** Maps only admins can play right now (any map can be switched; `GATED_MAPS` start that way). */
  lockedMaps: MapId[];
  /** Cinematics only admins can watch right now (`GATED_FILMS` start that way). */
  lockedFilms: FilmId[];
}

const OFFLINE: Account = { online: false, user: null, admin: false, banned: false, banReason: '', cards: {}, loginUrl: '', lockedMaps: [...GATED_MAPS], lockedFilms: [...GATED_FILMS] };

/**
 * What a map is to this player. `open`: live for everyone (always so). `public`: one of `GATED_MAPS`, opened to
 * everyone. `admin-only`: switched off for players, but this player is an admin. `dev-only`: a gated map in a local dev
 * build with no server. `locked`: not available.
 */
export type MapAccess = 'open' | 'public' | 'admin-only' | 'dev-only' | 'locked';

export function mapAccess(a: Account, map: MapId): MapAccess {
  if (!a.online) return !GATED_MAPS.includes(map) ? 'open' : import.meta.env.DEV ? 'dev-only' : 'locked';
  if (!a.lockedMaps.includes(map)) return GATED_MAPS.includes(map) ? 'public' : 'open';
  return a.admin ? 'admin-only' : 'locked';
}

/** The first map this player may pick (the admins keep at least one live). */
export function firstOpenMap(a: Account): MapId {
  return MAP_IDS.find((m) => mapAccess(a, m) !== 'locked') ?? 'district';
}

const lockedFrom = (v: unknown): MapId[] => (Array.isArray(v) ? MAP_IDS.filter((m) => v.includes(m)) : [...GATED_MAPS]);

async function post<T>(path: string, body: unknown, keepalive = false): Promise<T | null> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds': '1' }, body: JSON.stringify(body ?? {}), keepalive });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function loadAccount(): Promise<Account> {
  try {
    const r = await fetch('/api/me', { headers: { accept: 'application/json' } });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return { ...OFFLINE };
    const d = (await r.json()) as { user: AccountUser | null; admin?: boolean; banned?: boolean; banReason?: string; cards?: Record<string, number>; devLogin?: boolean; lockedMaps?: unknown; lockedFilms?: unknown };
    return { online: true, user: d.user, admin: !!d.admin, banned: !!d.banned, banReason: d.banReason ?? '', cards: d.cards ?? {}, loginUrl: d.devLogin ? '/auth/dev' : '/auth/discord', lockedMaps: lockedFrom(d.lockedMaps), lockedFilms: lockedFilmsFrom(d.lockedFilms) };
  } catch {
    return { ...OFFLINE };
  }
}

/** `page`: which page the visit is to (the pages beside the game report their own). */
export function reportVisit(touch: boolean, page: 'game' | 'excalibur' | 'hollow' | 'bestiary' = 'game'): void {
  void post('/api/visit', { touch, page });
}

export function ping(): void {
  void post('/api/ping', {});
}

export async function reportPlayer(target: string, reason: string, context: string): Promise<boolean> {
  return (await post<{ ok: boolean }>('/api/reports', { target, reason, context }))?.ok === true;
}

/** Is a co-op session with this code open right now? */
/** A co-op session's public details, or null when it has ended / never existed. */
export async function roomInfo(code: string): Promise<{ map: MapId; kind: string; hosting: string } | null> {
  try {
    const r = await fetch(`/api/rooms/${encodeURIComponent(code.toUpperCase().slice(0, 12))}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { map?: string; kind?: string; hosting?: string };
    return { map: asMapId(j.map), kind: j.kind ?? 'mission', hosting: j.hosting ?? 'server' };
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await post('/auth/logout', {});
}

/** The coarse device a run was played on (no renderer string, screen size or user agent). */
export interface RunDevice {
  device: DeviceClass;
  gpu: GpuVendor | null;
  /** The quality tier the run started on. */
  quality: QualityLevel;
}

/** How the run ran: the tier it ended on, mean frame rate, p95 frame time and the lowest render scale reached. */
export interface RunPerf {
  quality: QualityLevel;
  fps: number;
  p95Ms: number;
  renderScale: number;
}

/**
 * Reports one run at a time. Calls are chained, so an `end` issued before the server has answered the `start`
 * still closes the right run.
 */
export class RunTracker {
  private chain: Promise<number | null> = Promise.resolve(null);
  private open = false;

  constructor(private readonly enabled: () => boolean) {}

  get running(): boolean {
    return this.open;
  }

  /**
   * `version` is the build (no leading v), `difficulty` the infected's: the leaderboards are split by both. `story`: a
   * Sakura District story mission (kept off the leaderboards: it starts with a contract settled).
   */
  start(mode: GameMode, touch: boolean, map: string, version: string, difficulty: string, device: RunDevice, story: string | null = null): void {
    if (!this.enabled()) return;
    this.open = true;
    const body = { mode, touch, map, version, difficulty, device: device.device, gpu: device.gpu, quality: device.quality, story };
    this.chain = this.chain.then(async () => (await post<{ id: number }>('/api/runs', body))?.id ?? null);
  }

  /** `keepalive` lets the request outlive the page (tab closing). `perf` is null when too few frames were drawn. */
  end(outcome: 'victory' | 'defeat' | 'abandoned', reason: string, stats: MissionStats, perf: RunPerf | null, keepalive = false): void {
    if (!this.open) return;
    this.open = false;
    this.chain = this.chain.then(async (id) => {
      if (id !== null) await post(`/api/runs/${id}/end`, { outcome, reason, stats, perf }, keepalive);
      return null;
    });
  }

  /** Record a recovered card; resolves with the account's new card counts (null when nothing was recorded). */
  async card(card: string): Promise<Record<string, number> | null> {
    if (!this.open) return null;
    const id = await this.chain;
    if (id === null) return null;
    return (await post<{ cards: Record<string, number> }>(`/api/runs/${id}/card`, { card }))?.cards ?? null;
  }
}
