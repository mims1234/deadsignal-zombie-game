import { describe, expect, it } from 'vitest';
import { type Account, firstGuestMap, firstOpenMap, mapAccess, needsLogin } from '../src/net/account';

const acct = (over: Partial<Account>): Account => ({ online: true, user: null, admin: false, banned: false, banReason: '', cards: {}, loginUrl: '', lockedMaps: ['sakura'], lockedFilms: [], lockedSwitches: [], boards: true, guestMaps: ['district'], ...over });

describe('map access (gated maps the admins open from the dashboard)', () => {
  it('leaves ordinary maps open to everyone', () => {
    expect(mapAccess(acct({}), 'district')).toBe('open');
    expect(mapAccess(acct({ admin: true }), 'forge')).toBe('open');
  });

  it('hides a gated map from players until it is public', () => {
    expect(mapAccess(acct({}), 'sakura')).toBe('locked');
    expect(mapAccess(acct({ lockedMaps: [] }), 'sakura')).toBe('public');
  });

  it('lets admins play it either way, and says which', () => {
    expect(mapAccess(acct({ admin: true }), 'sakura')).toBe('admin-only');
    expect(mapAccess(acct({ admin: true, lockedMaps: [] }), 'sakura')).toBe('public');
  });

  it('can switch any map off for players, and sends them to the first one still live', () => {
    expect(mapAccess(acct({ lockedMaps: ['district', 'sakura'] }), 'district')).toBe('locked');
    expect(mapAccess(acct({ admin: true, lockedMaps: ['district'] }), 'district')).toBe('admin-only');
    expect(firstOpenMap(acct({ lockedMaps: ['district', 'sakura'] }))).toBe('forge');
    expect(firstOpenMap(acct({ lockedMaps: [] }))).toBe('district');
    expect(firstOpenMap(acct({ admin: true, lockedMaps: ['district', 'sakura', 'forge', 'asylum'] }))).toBe('district');
  });

  it('shows it in a local dev build with no server', () => {
    expect(mapAccess(acct({ online: false }), 'sakura')).toBe(import.meta.env.DEV ? 'dev-only' : 'locked');
  });
});

describe('guests (no Discord sign-in)', () => {
  it('plays solo on the maps open to guests', () => {
    expect(needsLogin(acct({}), 'district', 'standard')).toBeNull();
    expect(needsLogin(acct({}), 'district', 'roam')).toBeNull();
  });

  it('needs a sign-in for the other maps, co-op and the card hunt', () => {
    expect(needsLogin(acct({}), 'forge', 'standard')).toBe('map');
    expect(needsLogin(acct({}), 'district', 'coop')).toBe('coop');
    expect(needsLogin(acct({}), 'district', 'cards')).toBe('cards');
  });

  it('never asks a signed-in player, or a build with no server', () => {
    const user = { id: '1', name: 'A', username: 'a', avatar: null };
    expect(needsLogin(acct({ user }), 'forge', 'coop')).toBeNull();
    expect(needsLogin(acct({ online: false }), 'forge', 'coop')).toBeNull();
  });

  it('finds the first map open to guests, skipping a locked one', () => {
    expect(firstGuestMap(acct({ guestMaps: ['forge', 'asylum'] }))).toBe('forge');
    expect(firstGuestMap(acct({ guestMaps: ['sakura'] }))).toBeNull();
    expect(firstGuestMap(acct({ guestMaps: [] }))).toBeNull();
  });
});
