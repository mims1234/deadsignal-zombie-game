/**
 * Where the game runs: the website (zombies.genxmims.org) or a Discord Activity (an iframe at <app>.discordsays.com,
 * proxied to the same server). The game asks this module instead of branching on the mode itself; on the website
 * everything here does what the game always did.
 *
 * In Discord the player is signed in through the Embedded App SDK (no page redirect, no cookies: the iframe's cookies
 * are third-party and may be dropped), and the server's session token travels as an `Authorization: Bearer` header on
 * every API call and as `?s=` on the co-op socket. The SDK itself is loaded only inside Discord (`./discord`).
 */

/** Discord adds these to the Activity's URL; the SDK reads `frame_id` from it, so a reload must keep them. */
const LAUNCH_KEYS = ['frame_id', 'instance_id', 'platform', 'guild_id', 'channel_id', 'location_id', 'referrer_id', 'custom_id'];

// (no window: the tests, which run the game's modules in Node)
const browser = typeof window !== 'undefined';
const launch = new URLSearchParams(browser ? window.location.search : '');

/** Running inside a Discord Activity. */
export const IS_DISCORD = browser && (launch.has('frame_id') || /\.discordsays\.com$/i.test(window.location.hostname));

/** The server's session token for this player (Discord only: the website keeps its cookie). */
let sessionToken: string | null = null;
const TOKEN_KEY = 'deadsignal.discordSession';

export function setSessionToken(t: string | null): void {
  sessionToken = t;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage off: kept in memory for this page only */
  }
}

/** The token kept from before a reload in this Activity (a map change reloads the page). */
export function storedSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Headers for an API call: the session token in Discord, nothing on the website (its cookie goes by itself). */
export function authHeaders(): Record<string, string> {
  return sessionToken ? { authorization: `Bearer ${sessionToken}` } : {};
}

/** `fetch` for the game's own API: adds the session header in Discord. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, { ...init, headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) } });
}

/** The co-op socket's address (in Discord it carries the session token: a WebSocket cannot send headers). */
export function socketUrl(): string {
  const base = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return sessionToken ? `${base}?s=${encodeURIComponent(sessionToken)}` : base;
}

/**
 * This page's address with `query` (e.g. `{ room: 'ABC123' }`), for reloads and address rewrites. In Discord the
 * launch parameters stay on it, or the reloaded page could not talk to Discord.
 */
export function pagePath(query: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (IS_DISCORD) for (const k of LAUNCH_KEYS) {
    const v = launch.get(k);
    if (v !== null) q.set(k, v);
  }
  for (const [k, v] of Object.entries(query)) q.set(k, v);
  const s = q.toString();
  return s ? `${window.location.pathname}?${s}` : window.location.pathname;
}

/** What Discord-only features the game can call; on the website each is a no-op or the old behaviour. */
export interface DiscordBridge {
  /** The Activity instance: everyone in the same voice channel's Activity shares it. */
  instanceId: string;
  /** Discord's own invite dialog. */
  invite(): void;
  /** A link out of the Activity (an iframe cannot open tabs itself). */
  openExternal(url: string): void;
  /** The "Playing" line on the player's Discord profile. */
  presence(details: string, state: string): void;
}

let bridge: DiscordBridge | null = null;

/** The Discord features, once `startPlatform` has signed in (null on the website or when Discord could not be reached). */
export function discord(): DiscordBridge | null {
  return bridge;
}

/**
 * Before anything talks to the server: on the website nothing; in Discord, the SDK handshake and the sign-in. Never
 * throws: when Discord or the sign-in fails the game starts signed out, as a guest.
 */
export async function startPlatform(onStatus: (msg: string) => void = () => {}): Promise<void> {
  if (!IS_DISCORD) return;
  try {
    const { connectDiscord } = await import('./discord');
    bridge = await connectDiscord(onStatus);
  } catch (err) {
    console.warn('[discord] could not start the Activity', err);
  }
}

/** The co-op invite link (the website's; Discord players invite through `discord().invite()`). */
export function roomLink(code: string): string {
  return `${location.origin}/?room=${code}`;
}

/** Ask the server which co-op session this Activity instance is playing (null: none yet). */
export async function instanceRoom(): Promise<string | null> {
  if (!bridge) return null;
  try {
    const r = await apiFetch(`/api/rooms/instance/${encodeURIComponent(bridge.instanceId)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { code?: string | null };
    return typeof j.code === 'string' ? j.code : null;
  } catch {
    return null;
  }
}
