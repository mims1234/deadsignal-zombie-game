import { describe, expect, it } from 'vitest';
import { filmAccess, GATED_FILMS, lockedFilmsFrom } from '../src/films';

const viewer = (over: Partial<{ online: boolean; admin: boolean; lockedFilms: ('excalibur' | 'hollow')[] }>) => ({ online: true, admin: false, lockedFilms: ['hollow' as const], ...over });

describe('film access', () => {
  it('starts with Slime Hollow private and Excalibur public', () => {
    expect(GATED_FILMS).toEqual(['hollow']);
    expect(filmAccess(viewer({}), 'excalibur')).toBe('open');
    expect(filmAccess(viewer({}), 'hollow')).toBe('locked');
  });

  it('shows a private film to admins only, marked as theirs', () => {
    expect(filmAccess(viewer({ admin: true }), 'hollow')).toBe('admin-only');
    expect(filmAccess(viewer({ admin: true }), 'excalibur')).toBe('open');
  });

  it('follows the switches: any film can be private, any public', () => {
    expect(filmAccess(viewer({ lockedFilms: [] }), 'hollow')).toBe('open');
    expect(filmAccess(viewer({ lockedFilms: ['excalibur', 'hollow'] }), 'excalibur')).toBe('locked');
  });

  it('keeps private films hidden when the server sends nothing readable', () => {
    expect(lockedFilmsFrom(undefined)).toEqual(['hollow']);
    expect(lockedFilmsFrom('hollow')).toEqual(['hollow']);
    expect(lockedFilmsFrom(['excalibur', 'nope'])).toEqual(['excalibur']);
    expect(lockedFilmsFrom([])).toEqual([]);
  });

  it('shows private films in a dev build with no server (never in a built page)', () => {
    expect(filmAccess(viewer({ online: false }), 'hollow')).toBe(import.meta.env.DEV ? 'dev-only' : 'locked');
  });
});
