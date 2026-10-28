/**
 * The admin page's switches for everything that is not a map or a film (those have their own: `GATED_MAPS`,
 * `src/films.ts`): co-op, the ways to host it, Free roam, the Mazoku card hunt, each Sakura District story, Aurelia
 * herself, the bestiary and its Style Lab. Each is live for everyone or admin only, from the Visibility tab. The server
 * keeps the same list (`SWITCHES` in server/index.mjs) and refuses what is off; the game hides it.
 */
export const SWITCH_IDS = ['coop', 'roam', 'cards', 'host-server', 'host-self', 'story-kaika', 'story-curtain', 'story-lasttrain', 'story-hanami', 'aurelia-npc', 'bestiary', 'stylelab'] as const;
export type SwitchId = (typeof SWITCH_IDS)[number];

/** Switches that start admin only, until an admin puts them live (and that a build with no server keeps off). */
export const GATED_SWITCHES: readonly SwitchId[] = [];

/** The switches that are off, out of what the server sent: everything it did not say is open (unreadable: the gated ones). */
export function lockedSwitchesFrom(open: unknown, locked: unknown): SwitchId[] {
  if (Array.isArray(open)) return SWITCH_IDS.filter((s) => !open.includes(s));
  if (Array.isArray(locked)) return SWITCH_IDS.filter((s) => locked.includes(s));
  return [...GATED_SWITCHES];
}

/**
 * What a switch is to this player. `open`: live. `admin-only`: off for players, but this player is an admin.
 * `dev-only`: off, in a local dev build with no server. `locked`: off.
 */
export type SwitchAccess = 'open' | 'admin-only' | 'dev-only' | 'locked';

export function switchAccess(a: { online: boolean; admin: boolean; lockedSwitches: readonly SwitchId[] }, id: SwitchId): SwitchAccess {
  if (!a.lockedSwitches.includes(id)) return 'open';
  if (a.online) return a.admin ? 'admin-only' : 'locked';
  return import.meta.env.DEV ? 'dev-only' : 'locked';
}

/** May this player see and use it (live, or they are an admin)? */
export function switchShown(a: { online: boolean; admin: boolean; lockedSwitches: readonly SwitchId[] }, id: SwitchId): boolean {
  return switchAccess(a, id) !== 'locked';
}

/** The switch a mode or a co-op session kind falls under, if any (the same rule as the server's). */
export function switchOfKind(kind: string): SwitchId | null {
  if (kind === 'roam') return 'roam';
  if (kind === 'cards' || kind === 'mazoku') return 'cards';
  const story = `story-${kind}`;
  return (SWITCH_IDS as readonly string[]).includes(story) ? (story as SwitchId) : null;
}
