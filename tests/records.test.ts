/**
 * RECOVER THE RECORDS: each file pays once, the set's bonus pays once, and every file lies where it was meant to
 * (inside its building, on the Asylum's real colliders, within reach of the insertion point).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { ASY_LINE } from '../src/asylum/lines';
import { RECORD_NOTES } from '../src/asylum/lore';
import { RECORDS } from '../src/asylum/nightConfig';
import { setWard9Open } from '../src/asylum/upstairs';
import { createRecords, nearestRecord, pickUpRecord, recordInReach, recordsFound } from '../src/logic/records';
import { SessionSim } from '../src/sim/serverHost';
import { FlowField } from '../src/world/nav';

describe('the patient files', () => {
  it('are five, each with its note and a voiced line read over it', () => {
    expect(RECORDS.spots.length).toBe(5);
    expect(RECORD_NOTES.length).toBe(RECORDS.spots.length);
    for (const n of RECORD_NOTES) {
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.body.length).toBeGreaterThan(80);
      expect(n.lines.length).toBeGreaterThan(0);
      for (const id of n.lines) expect(ASY_LINE[id], id).toBeDefined();
    }
    const c = createRecords();
    expect(c.status).toBe('active');
    expect(recordsFound(c)).toBe(0);
  });

  it('pay once each, and the bonus once when the last one is in', () => {
    const c = createRecords();
    let paid = 0;
    const a = pickUpRecord(c, 1)!;
    expect(a).toEqual({ index: 1, cash: RECORDS.cashEach, count: 1, completed: false });
    paid += a.cash;
    expect(pickUpRecord(c, 1)).toBeNull(); // the same file never pays twice
    expect(pickUpRecord(c, -1)).toBeNull();
    expect(pickUpRecord(c, 5)).toBeNull();
    paid += pickUpRecord(c, 0)!.cash;
    paid += pickUpRecord(c, 3)!.cash;
    paid += pickUpRecord(c, 4)!.cash;
    expect(c.status).toBe('active');
    const last = pickUpRecord(c, 2)!;
    expect(last.completed).toBe(true);
    expect(last.cash).toBe(RECORDS.cashEach + RECORDS.bonus);
    paid += last.cash;
    expect(c.status).toBe('complete');
    expect(c.bonusClaimed).toBe(true);
    expect(paid).toBe(RECORDS.cashEach * 5 + RECORDS.bonus);
    for (let i = 0; i < 5; i++) expect(pickUpRecord(c, i)).toBeNull();
    // the state is plain data (co-op sends it as is)
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it('are taken by walking up to them', () => {
    const c = createRecords();
    const s = RECORDS.spots[2]!;
    expect(recordInReach(c, s.x + RECORDS.pickupRadius * 0.9, s.z)).toBe(2);
    expect(recordInReach(c, s.x + RECORDS.pickupRadius * 1.1, s.z)).toBe(-1);
    expect(nearestRecord(c, s.x + 3, s.z)!.index).toBe(2);
    pickUpRecord(c, 2);
    expect(recordInReach(c, s.x, s.z)).toBe(-1);
    expect(nearestRecord(c, s.x, s.z)!.index).not.toBe(2);
    for (let i = 0; i < 5; i++) pickUpRecord(c, i);
    expect(nearestRecord(c, 0, 0)).toBeNull();
  });

  it('lie indoors, two of them upstairs, each within reach on its own floor', () => {
    const level = new SessionSim({ map: 'asylum', send: () => {} }).level;
    setWard9Open(level, true); // with the power on
    const field = new FlowField(level.nav);
    field.compute(level.data.playerStart.x, level.data.playerStart.z);
    const [admin, ward, nurses, nine, morgue] = RECORDS.spots;
    // the buildings' footprints (world/layout/asylum.ts)
    expect(Math.abs(admin!.x) < 12 && admin!.z > 4 && admin!.z < 11).toBe(true);
    expect(ward!.x > -29 && ward!.x < -15 && ward!.z > -22 && ward!.z < 10).toBe(true);
    expect(nurses!.x > -29 && nurses!.x < -15 && nurses!.y > 4.5).toBe(true);
    expect(nine!.x > 15 && nine!.x < 29 && nine!.y > 4.5).toBe(true);
    expect(morgue!.x > 20 && morgue!.x < 36 && morgue!.z > -41 && morgue!.z < -29).toBe(true);
    for (const s of RECORDS.spots) {
      // under a roof
      const up = level.world.raycast(s.x, s.y + 0.3, s.z, 0, 1, 0, 20, 'shots');
      expect(up?.collider?.tag, s.id).toBe('roof');
      // somewhere a player can stand and pick it up from: upstairs, on that floor's grid, from the top of its stairs
      const fl = level.floors;
      const area = s.y > 3 ? fl.areaAt(s.x, s.y, s.z) : 0;
      expect(area > 0, s.id).toBe(s.y > 3);
      let f = field;
      if (area > 0) {
        const link = fl.links.find((l) => l.upper === area)!;
        const top = link.path[link.path.length - 1]!;
        f = new FlowField(fl.navOf(area));
        f.compute(top.x, top.z);
      }
      let reach = false;
      for (let r = 0; r <= RECORDS.pickupRadius * 0.85 && !reach; r += 0.25) {
        for (let a = 0; a < Math.PI * 2 && !reach; a += Math.PI / 8) reach = f.isReachable(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r);
      }
      expect(reach, s.id).toBe(true);
    }
  });
});
