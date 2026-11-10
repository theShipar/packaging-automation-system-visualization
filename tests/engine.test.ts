import { describe, expect, it } from 'vitest';
import { advance, createSession, dispatchCommand, runUntil } from '../src/domain/engine';
import { checkInvariants, sessionHash } from '../src/domain/invariants';
import { lineKpis, unitCounts } from '../src/domain/kpis';
import { SCENARIOS, runScenario } from '../src/domain/scenarios';
import type { Session } from '../src/domain/types';

function runChecked(s: Session, horizon: number, step = 7) {
  if (s.status === 'ready') dispatchCommand(s, { kind: 'START' });
  while (s.t < horizon && s.status === 'running') {
    advance(s, Math.min(horizon, s.t + step));
    expect(checkInvariants(s)).toEqual([]);
  }
}

describe('determinism', () => {
  it('SIM-001 same seed and commands give identical hashes', () => {
    const a = createSession({ seed: 7 });
    const b = createSession({ seed: 7 });
    runUntil(a, 1800);
    runUntil(b, 1800);
    expect(sessionHash(a)).toBe(sessionHash(b));
    const c = createSession({ seed: 8 });
    runUntil(c, 1800);
    expect(sessionHash(c)).not.toBe(sessionHash(a));
  });

  it('frame step size does not change the result (speed independence)', () => {
    const a = createSession({ seed: 3 });
    const b = createSession({ seed: 3 });
    runUntil(a, 1200, 0.1667);
    runUntil(b, 1200, 13);
    expect(sessionHash(a)).toBe(sessionHash(b));
  });
});

describe('conservation', () => {
  it('holds at every step through a full batch', () => {
    const s = createSession({ seed: 11 });
    runChecked(s, 5 * 3600, 37);
    const c = unitCounts(s);
    expect(c.unreleased + c.wip + c.rejected + c.dispatched).toBe(2400);
    if (s.awaitingPartialApproval) {
      expect(dispatchCommand(s, { kind: 'CLOSE_PARTIAL_CASE' }).ok).toBe(true);
      runChecked(s, s.t + 120, 5);
    }
    expect(s.status).toBe('completed');
    expect(s.batch.status).toBe('completed');
    const end = unitCounts(s);
    expect(end.wip).toBe(0);
    expect(end.rejected + end.dispatched).toBe(2400);
    expect(s.materials.retailCarton.consumed).toBe(end.dispatched);
  });

  it('cases hold exactly 12 kits except an approved partial case', () => {
    const s = createSession({ seed: 5 });
    runUntil(s, 1800);
    for (const c of s.cases.filter((x) => x.status !== 'open')) expect(c.unitIds.length).toBe(12);
  });
});

describe('quality', () => {
  it('QA rejects never reach packaging or dispatch', () => {
    const s = createSession({ seed: 21, config: { qa: { defectRate: 0.08 } } });
    runChecked(s, 2400, 11);
    const rejected = s.units.filter((u) => u.state === 'rejected');
    expect(rejected.length).toBeGreaterThan(10);
    for (const u of rejected) {
      expect(u.packaged).toBe(false);
      expect(u.caseId).toBeNull();
    }
  });

  it('recalibration applies to later units only; earlier decisions are immutable', () => {
    const { session: s } = runScenario(SCENARIOS.find((x) => x.id === 'quality-drift')!);
    const versions = new Set(s.inspections.map((i) => i.ruleVersion));
    expect(versions.has('QC-STD-1.0')).toBe(true);
    expect(versions.has('QC-STD-1.1')).toBe(true);
    const during = s.inspections.filter((i) => i.at > 150 && i.at < 900);
    const after = s.inspections.filter((i) => i.at > 960);
    const rate = (xs: typeof during) => xs.filter((i) => i.result === 'reject').length / xs.length;
    expect(rate(during)).toBeGreaterThan(rate(after) * 3);
  });
});

describe('pause', () => {
  it('pausing mid-cycle preserves remaining time', () => {
    const s = createSession({ seed: 2 });
    dispatchCommand(s, { kind: 'START' });
    advance(s, 14.3);
    const job = s.stations.intake.current!;
    const finish = job.finishAt;
    dispatchCommand(s, { kind: 'PAUSE' });
    const hash = sessionHash(s);
    advance(s, 100);
    expect(sessionHash(s)).toBe(hash);
    expect(s.t).toBeCloseTo(14.3, 5);
    dispatchCommand(s, { kind: 'RESUME' });
    expect(s.stations.intake.current?.finishAt).toBe(finish);
  });
});

describe('faults', () => {
  it('packaging jam latches, propagates backpressure and conserves units', () => {
    const s = createSession({ seed: 842 });
    runChecked(s, 600);
    const shippedBefore = lineKpis(s).shipped;
    expect(dispatchCommand(s, { kind: 'INJECT_FAULT', code: 'PKG_JAM' }).ok).toBe(true);
    expect(dispatchCommand(s, { kind: 'INJECT_FAULT', code: 'PKG_JAM' }).ok).toBe(false);
    runChecked(s, 900);
    expect(s.stations.packaging.status).toBe('faulted');
    expect(s.stations.qa.status).toBe('blocked');
    const f = s.faults.find((x) => x.code === 'PKG_JAM')!;
    expect(dispatchCommand(s, { kind: 'RESOLVE_FAULT', faultId: f.id }).ok).toBe(false);
    expect(dispatchCommand(s, { kind: 'CREATE_WORK_ORDER', faultId: f.id })).toEqual({ ok: false, reason: 'Acknowledge the fault first' });
    expect(dispatchCommand(s, { kind: 'ACK_FAULT', faultId: f.id }).ok).toBe(true);
    expect(dispatchCommand(s, { kind: 'CREATE_WORK_ORDER', faultId: f.id }).ok).toBe(true);
    expect(dispatchCommand(s, { kind: 'START_WORK_ORDER', workOrderId: f.workOrderId! }).ok).toBe(false);
    dispatchCommand(s, { kind: 'PAUSE' });
    expect(dispatchCommand(s, { kind: 'START_WORK_ORDER', workOrderId: f.workOrderId! }).ok).toBe(true);
    expect(s.stations.packaging.status).toBe('maintenance');
    expect(dispatchCommand(s, { kind: 'RESOLVE_FAULT', faultId: f.id }).ok).toBe(true);
    expect(dispatchCommand(s, { kind: 'RESOLVE_FAULT', faultId: f.id }).ok).toBe(false);
    expect(s.status).toBe('paused');
    dispatchCommand(s, { kind: 'RESUME' });
    runChecked(s, 1500);
    expect(f.status).toBe('recovered');
    expect(lineKpis(s).shipped).toBeGreaterThan(shippedBefore);
    expect(s.events.filter((e) => e.type === 'FAULT_RAISED').length).toBe(1);
  });

  it('label stockout blocks packaging without losing units and recovers on receipt', () => {
    const s = createSession({ seed: 9, materials: { label: 30 } });
    runChecked(s, 900);
    expect(s.stations.packaging.status).toBe('blocked');
    expect(s.faults.some((f) => f.code === 'PKG_LABEL_OUT')).toBe(true);
    const packaged = unitCounts(s).packaged;
    expect(packaged).toBe(30);
    dispatchCommand(s, { kind: 'RECEIVE_MATERIAL', material: 'label', qty: 500 });
    runChecked(s, 1200);
    expect(unitCounts(s).packaged).toBeGreaterThan(30);
  });

  it('settings apply only via command and emit SETTINGS_APPLIED', () => {
    const s = createSession({ seed: 1 });
    expect(dispatchCommand(s, { kind: 'APPLY_SETTINGS', stationId: 'packaging', values: { cycleSeconds: 99 } }).ok).toBe(false);
    expect(dispatchCommand(s, { kind: 'APPLY_SETTINGS', stationId: 'packaging', values: { cycleSeconds: 3.9 } }, 'viewer').ok).toBe(false);
    expect(dispatchCommand(s, { kind: 'APPLY_SETTINGS', stationId: 'packaging', values: { cycleSeconds: 3.9 } }).ok).toBe(true);
    expect(s.events.filter((e) => e.type === 'SETTINGS_APPLIED')).toHaveLength(1);
    expect(s.config.packaging.cycleSeconds).toBe(3.9);
  });

  it('all scenarios run headless with invariants intact', () => {
    for (const sc of SCENARIOS) {
      const { session } = runScenario(sc);
      expect(checkInvariants(session), sc.id).toEqual([]);
      expect(session.t).toBeGreaterThan(sc.horizonSec - 1);
    }
  });
});

describe('KPIs', () => {
  it('OEE is bounded and shows no data before enough runtime', () => {
    const s = createSession({ seed: 4 });
    expect(lineKpis(s).oee).toBeNull();
    runUntil(s, 1800);
    const o = lineKpis(s).oee!;
    expect(o.oee).toBeGreaterThan(0);
    expect(o.oee).toBeLessThanOrEqual(1);
  });

  it('throughput stays under the packaging ceiling of 800/h', () => {
    const s = createSession({ seed: 4 });
    runUntil(s, 3600);
    const k = lineKpis(s);
    // Shipments arrive as whole 12-kit cases, so a 15-minute window quantizes by 48/h.
    expect(k.throughputHr).toBeLessThanOrEqual(800 + 48);
    expect(k.throughputHr).toBeGreaterThan(600);
  });
});
