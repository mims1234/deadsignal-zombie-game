/**
 * The leaderboards (`server/db.mjs`): a run with the device report and a finished one ranks; a Sakura District story
 * mission (it starts with a contract settled) is recorded but never ranks.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain JavaScript module (the server)
import { openDb } from '../server/db.mjs';

interface Db {
  upsertUser(u: { id: string; username: string; display_name: string }): unknown;
  startRun(userId: string, mode: string, touch: boolean, map: string, version: string, difficulty: string, device?: object, story?: string | null): number;
  endRun(userId: string, id: number, body: object): boolean;
  run(id: number): Record<string, unknown>;
  leaderboard(q: { map: string; mode: string; metric: string }): { name: string; value: number }[];
}

describe('the leaderboards', () => {
  it('rank finished runs, and never a story mission', () => {
    const db = openDb(':memory:') as Db;
    db.upsertUser({ id: 'a', username: 'a', display_name: 'Aki' });
    db.upsertUser({ id: 'b', username: 'b', display_name: 'Bo' });
    const stats = (kills: number) => ({ outcome: 'victory', reason: 'Extracted', stats: { timeSurvived: 1, kills, headshots: 1, contractsCompleted: 2 }, perf: { quality: 'low', fps: 58.2, p95Ms: 21.5, renderScale: 0.9 } });
    const a = db.startRun('a', 'standard', false, 'sakura', '0.2.0', 'normal', { device: 'computer', gpu: 'NVIDIA', quality: 'low' });
    expect(db.endRun('a', a, stats(40))).toBe(true);
    const b = db.startRun('b', 'standard', false, 'sakura', '0.2.0', 'normal', {}, 'curtain');
    expect(db.endRun('b', b, stats(90))).toBe(true);
    expect(db.run(b).story).toBe('curtain');
    expect(db.run(a).quality).toBe('low');
    const board = db.leaderboard({ map: 'sakura', mode: 'solo', metric: 'kills' });
    expect(board.map((r) => r.name)).toEqual(['Aki']);
    // an unknown story is dropped (the run is an ordinary one)
    const c = db.startRun('b', 'standard', false, 'sakura', '0.2.0', 'normal', {}, 'nonsense');
    expect(db.run(c).story).toBeNull();
  });
});
