import { describe, expect, it } from 'vitest';
import { type Account, mapAccess } from '../src/net/account';

const acct = (over: Partial<Account>): Account => ({ online: true, user: null, admin: false, banned: false, banReason: '', cards: {}, loginUrl: '', lockedMaps: ['sakura'], ...over });

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

  it('shows it in a local dev build with no server', () => {
    expect(mapAccess(acct({ online: false }), 'sakura')).toBe(import.meta.env.DEV ? 'dev-only' : 'locked');
  });
});
