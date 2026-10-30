/**
 * The admin page's switches for everything that is not a map or a film (`src/switches.ts`), and how the account reads
 * what the server says is open (`src/net/account.ts`): a player is told only what is open; an admin is also told what
 * is off, to badge it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAccount, mapAccess } from '../src/net/account';
import { SWITCH_IDS, lockedSwitchesFrom, switchAccess, switchOfKind, switchShown } from '../src/switches';

const viewer = (over: Partial<{ online: boolean; admin: boolean; lockedSwitches: (typeof SWITCH_IDS)[number][] }>) => ({ online: true, admin: false, lockedSwitches: [], ...over });

afterEach(() => vi.unstubAllGlobals());

/** /api/me answering with `body`. */
function serverSays(body: object): void {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
}

describe('switches', () => {
  it('open to everyone when on; off: an admin still sees it, a player does not', () => {
    expect(switchAccess(viewer({}), 'coop')).toBe('open');
    expect(switchAccess(viewer({ lockedSwitches: ['coop'] }), 'coop')).toBe('locked');
    expect(switchAccess(viewer({ admin: true, lockedSwitches: ['coop'] }), 'coop')).toBe('admin-only');
    expect(switchShown(viewer({ lockedSwitches: ['roam'] }), 'roam')).toBe(false);
    expect(switchShown(viewer({ admin: true, lockedSwitches: ['roam'] }), 'roam')).toBe(true);
  });

  it('knows which switch a mode, a co-op session kind or a story falls under', () => {
    expect(switchOfKind('roam')).toBe('roam');
    expect(switchOfKind('cards')).toBe('cards');
    expect(switchOfKind('mazoku')).toBe('cards');
    expect(switchOfKind('kaika')).toBe('story-kaika');
    expect(switchOfKind('hanami')).toBe('story-hanami');
    expect(switchOfKind('mission')).toBeNull();
    expect(switchOfKind('standard')).toBeNull();
  });

  it('reads what is off from what is open (a player), or from the off list (an admin)', () => {
    expect(lockedSwitchesFrom(['coop', 'roam'], undefined)).toEqual(SWITCH_IDS.filter((s) => s !== 'coop' && s !== 'roam'));
    expect(lockedSwitchesFrom(undefined, ['stylelab', 'nope'])).toEqual(['stylelab']);
    expect(lockedSwitchesFrom(undefined, undefined)).toEqual([]);
  });
});

describe('the account, from /api/me', () => {
  it('a player: everything not said to be open is off (nothing hidden is named)', async () => {
    serverSays({ user: { id: '1', name: 'P', username: 'p', avatar: null }, openMaps: ['district', 'forge', 'asylum'], openFilms: ['excalibur'], openSwitches: SWITCH_IDS.filter((s) => s !== 'coop'), boards: false });
    const a = await loadAccount();
    expect(a.lockedMaps).toEqual(['sakura', 'aurelia', 'mujin']);
    expect(a.lockedFilms).toEqual(['hollow']);
    expect(a.lockedSwitches).toEqual(['coop']);
    expect(a.boards).toBe(false);
    expect(mapAccess(a, 'aurelia')).toBe('locked');
    expect(switchShown(a, 'coop')).toBe(false);
  });

  it('an admin: what is off is badged, not hidden', async () => {
    serverSays({ user: { id: '9', name: 'A', username: 'a', avatar: null }, admin: true, openMaps: ['district'], lockedMaps: ['aurelia'], openSwitches: [], lockedSwitches: ['stylelab'], boards: true });
    const a = await loadAccount();
    expect(mapAccess(a, 'aurelia')).toBe('admin-only');
    expect(switchAccess(a, 'stylelab')).toBe('admin-only');
  });

  it('an older server (only the off lists) still works', async () => {
    serverSays({ user: null, lockedMaps: ['sakura'], lockedFilms: [] });
    const a = await loadAccount();
    expect(a.lockedMaps).toEqual(['sakura']);
    expect(a.lockedSwitches).toEqual([]);
    expect(a.boards).toBe(true);
  });
});
