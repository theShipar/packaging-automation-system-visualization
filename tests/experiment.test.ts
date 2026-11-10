import { describe, expect, it } from 'vitest';
import { compareRuns, replayTo } from '../src/app/experiment';
import { createSession, dispatchCommand, runUntil } from '../src/domain/engine';
import { sessionHash } from '../src/domain/invariants';

const started = (t: number) => {
  const s = createSession({ seed: 842 });
  runUntil(s, t);
  return s;
};

describe('experiment baseline replay', () => {
  it('EXP-001 replaying a snapshot is identical to running the same session on', () => {
    const snap = started(300);
    const live = structuredClone(snap);
    runUntil(live, 900);
    const replay = replayTo(snap, 900);
    expect(sessionHash(replay)).toBe(sessionHash(live));
    expect(snap.t).toBe(300);
  });

  it('EXP-002 an unchanged live run compares with zero deltas', () => {
    const snap = started(300);
    const live = structuredClone(snap);
    runUntil(live, 1200);
    const r = compareRuns(snap, live);
    expect(r.t).toBe(1200);
    expect(r.live.shipped).toBe(r.base.shipped);
    expect(r.live.rejected).toBe(r.base.rejected);
    expect(r.live.downtimeSec).toBeCloseTo(r.base.downtimeSec, 6);
    expect(r.live.energyKWh).toBeCloseTo(r.base.energyKWh, 6);
  });

  it('EXP-003 a packaging jam after the baseline shows as lost output and added downtime', () => {
    const snap = started(300);
    const live = structuredClone(snap);
    expect(dispatchCommand(live, { kind: 'INJECT_FAULT', code: 'PKG_JAM' }).ok).toBe(true);
    runUntil(live, 900);
    const r = compareRuns(snap, live);
    expect(r.live.shipped).toBeLessThan(r.base.shipped);
    expect(r.live.downtimeSec).toBeGreaterThan(r.base.downtimeSec + 300);
  });
});
