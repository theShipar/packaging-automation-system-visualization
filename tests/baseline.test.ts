/*
 * U0 golden baseline: batch B-0842, default seed, observed every 15 virtual minutes.
 * The snapshot was recorded before the LineFlow 2.0 UI work; any diff means the domain changed.
 */
import { describe, expect, it } from 'vitest';
import { advance, createSession, dispatchCommand } from '../src/domain/engine';
import { checkInvariants, sessionHash } from '../src/domain/invariants';
import { lineKpis, stationView, unitCounts } from '../src/domain/kpis';
import { hashString } from '../src/domain/rng';
import { STATION_IDS, type Session } from '../src/domain/types';
import { describeUnit, frameUnits, machinePose } from '../src/transport/poses';
import { queueBadges } from '../src/transport/queueLayout';

const STEP = 15 * 60;
const HORIZON = 6 * STEP;

function observe(s: Session) {
  const c = unitCounts(s);
  return {
    t: s.t,
    shipped: lineKpis(s).shipped,
    wip: c.wip,
    rejected: c.rejected,
    unreleased: c.unreleased,
    dispatched: c.dispatched,
    reconciles: c.unreleased + c.wip + c.rejected + c.dispatched === s.batch.planned,
    buffers: Object.fromEntries(STATION_IDS.map((id) => [id, `${s.stations[id].inQ.length}/${s.stations[id].outQ.length}`])),
    events: s.events.length,
    eventOrder: hashString(s.events.map((e) => `${e.seq}:${e.type}:${e.unitId ?? ''}`).join('|')).toString(16),
  };
}

/** Everything the workspace reads per frame or per UI tick: none of it may write to the session. */
function readLikeTheUi(s: Session) {
  frameUnits(s);
  queueBadges(s);
  lineKpis(s);
  for (const id of STATION_IDS) {
    stationView(s, id);
    machinePose(s, id, 0);
  }
  for (const u of s.units.slice(0, 200)) if (u.state !== 'unreleased') describeUnit(s, u);
}

function run(withUi: boolean, frame: number) {
  const s = createSession();
  dispatchCommand(s, { kind: 'START' });
  const out = [];
  let next = STEP;
  while (s.t < HORIZON && s.status === 'running') {
    advance(s, Math.min(next, s.t + frame));
    if (withUi) readLikeTheUi(s);
    if (s.t >= next - 1e-9) {
      expect(checkInvariants(s)).toEqual([]);
      out.push(observe(s));
      next += STEP;
    }
  }
  return { samples: out, hash: sessionHash(s) };
}

describe('U0 baseline', () => {
  it('BASE-001 B-0842 at 15-minute steps matches the recorded golden run', () => {
    const { samples } = run(false, 13);
    expect(samples).toHaveLength(6);
    for (const x of samples) expect(x.reconciles).toBe(true);
    expect(samples).toMatchSnapshot();
  });

  it('BASE-002 reading every UI selector each frame does not change the run (inspector, follow, camera)', () => {
    const plain = run(false, 1 / 30);
    const watched = run(true, 1 / 30);
    expect(watched.hash).toBe(plain.hash);
    expect(watched.samples).toEqual(plain.samples);
  });
});
