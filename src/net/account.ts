/**
 * The player's account and everything the game reports to the server: visits, runs and recovered cards.
 * Every call is best-effort. When there is no server behind the page (a plain static host, or the Vite dev server
 * on its own) `online` is false and the game runs as a local, signed-out build that reports nothing.
 */
import type { GameMode, MissionStats } from '../types';

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
}

const OFFLINE: Account = { online: false, user: null, admin: false, banned: false, banReason: '', cards: {}, loginUrl: '' };

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
    const d = (await r.json()) as { user: AccountUser | null; admin?: boolean; banned?: boolean; banReason?: string; cards?: Record<string, number>; devLogin?: boolean };
    return { online: true, user: d.user, admin: !!d.admin, banned: !!d.banned, banReason: d.banReason ?? '', cards: d.cards ?? {}, loginUrl: d.devLogin ? '/auth/dev' : '/auth/discord' };
  } catch {
    return { ...OFFLINE };
  }
}

export function reportVisit(touch: boolean): void {
  void post('/api/visit', { touch });
}

export function ping(): void {
  void post('/api/ping', {});
}

export async function reportPlayer(target: string, reason: string, context: string): Promise<boolean> {
  return (await post<{ ok: boolean }>('/api/reports', { target, reason, context }))?.ok === true;
}

export async function logout(): Promise<void> {
  await post('/auth/logout', {});
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

  start(mode: GameMode, touch: boolean): void {
    if (!this.enabled()) return;
    this.open = true;
    this.chain = this.chain.then(async () => (await post<{ id: number }>('/api/runs', { mode, touch }))?.id ?? null);
  }

  /** `keepalive` lets the request outlive the page (tab closing). */
  end(outcome: 'victory' | 'defeat' | 'abandoned', reason: string, stats: MissionStats, keepalive = false): void {
    if (!this.open) return;
    this.open = false;
    this.chain = this.chain.then(async (id) => {
      if (id !== null) await post(`/api/runs/${id}/end`, { outcome, reason, stats }, keepalive);
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
