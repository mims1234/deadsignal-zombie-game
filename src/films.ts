/**
 * The cinematics: short films set apart from the game, each its own page. Every film is public (anyone can watch it and
 * it shows on the CINEMATICS page and in the bestiary) or admin only, switched from the admin page's Cinematics tab.
 * The server keeps the same list (`FILMS` in server/index.mjs) and refuses a private film's page to players.
 */
export const FILM_IDS = ['excalibur', 'hollow'] as const;
export type FilmId = (typeof FILM_IDS)[number];

/** Films that start admin only, until an admin puts them live (and that a build with no server keeps locked). */
export const GATED_FILMS: readonly FilmId[] = ['hollow'];

/** The private films out of what the server sent (anything unreadable: the films that start private). */
export const lockedFilmsFrom = (v: unknown): FilmId[] => (Array.isArray(v) ? FILM_IDS.filter((f) => v.includes(f)) : [...GATED_FILMS]);

/**
 * What a film is to this viewer. `open`: public. `admin-only`: private, and this viewer is an admin. `dev-only`: a
 * private film in a local dev build with no server. `locked`: not shown.
 */
export type FilmAccess = 'open' | 'admin-only' | 'dev-only' | 'locked';

export function filmAccess(a: { online: boolean; admin: boolean; lockedFilms: readonly FilmId[] }, film: FilmId): FilmAccess {
  if (!a.lockedFilms.includes(film)) return 'open';
  if (a.online) return a.admin ? 'admin-only' : 'locked';
  return import.meta.env.DEV ? 'dev-only' : 'locked';
}
