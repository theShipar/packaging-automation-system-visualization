import { createSession, runUntil, type CreateOptions } from './engine';
import { lineKpis, unitCounts } from './kpis';
import type { FaultCode, ScheduledCommand, Session, StationId } from './types';

export interface Scenario {
  id: string;
  title: string;
  goal: string;
  description: string;
  seed: number;
  horizonSec: number;
  options: CreateOptions;
  /** Scripted recovery used only by the headless comparison run. */
  recovery: ScheduledCommand[];
  affected: StationId[];
  expectedSymptoms: string;
  expectedActions: string;
}

const repair = (code: FaultCode, at: number): ScheduledCommand[] => [
  { at, command: { kind: 'ACK_FAULT', faultId: `@${code}` }, actor: 'supervisor' },
  { at, command: { kind: 'CREATE_WORK_ORDER', faultId: `@${code}` }, actor: 'supervisor' },
  { at, command: { kind: 'PAUSE' }, actor: 'supervisor' },
  { at, command: { kind: 'START_WORK_ORDER', workOrderId: `@${code}` }, actor: 'supervisor' },
  { at, command: { kind: 'RESOLVE_FAULT', faultId: `@${code}` }, actor: 'supervisor' },
  { at, command: { kind: 'RESUME' }, actor: 'supervisor' },
];

const fault = (code: FaultCode, at: number): ScheduledCommand => ({ at, command: { kind: 'INJECT_FAULT', code }, actor: 'supervisor' });

export const SCENARIOS: Scenario[] = [
  {
    id: 'baseline',
    title: 'Normal throughput',
    goal: 'All six stations flow; clean dispatch',
    description: 'Batch B-0842 with baseline settings. Packaging (4.5 s) is the modelled constraint at 800 units/h before rejects.',
    seed: 842,
    horizonSec: 3600,
    options: { seed: 842 },
    recovery: [],
    affected: [],
    expectedSymptoms: 'Positive shipped progress, ~1.5% QA rejects, no faults.',
    expectedActions: 'Watch tokens, inspect stations, check the batch reconciliation.',
  },
  {
    id: 'packaging-jam',
    title: 'Packaging jam',
    goal: 'Diagnose and restore while conserving every unit',
    description: 'A carton jams at the outfeed photoeye 3 virtual minutes in. Backpressure fills QA, robot and assembly buffers.',
    seed: 842,
    horizonSec: 3600,
    options: { seed: 842, scenarioId: 'packaging-jam', scheduled: [fault('PKG_JAM', 180)] },
    recovery: repair('PKG_JAM', 420),
    affected: ['packaging', 'qa', 'robot'],
    expectedSymptoms: 'Packaging faulted, upstream blocked, dispatch drains then starves, ETA delayed.',
    expectedActions: 'Acknowledge, create work order, pause, clear jam, resume.',
  },
  {
    id: 'robot-vacuum',
    title: 'Robot vacuum loss',
    goal: 'Recover the arm without double counting the held kit',
    description: 'Gripper vacuum drops at 2.5 minutes while a kit is mid-transfer.',
    seed: 842,
    horizonSec: 3600,
    options: { seed: 842, scenarioId: 'robot-vacuum', scheduled: [fault('ROB_VACUUM_LOSS', 150)] },
    recovery: repair('ROB_VACUUM_LOSS', 330),
    affected: ['robot', 'assembly', 'qa'],
    expectedSymptoms: 'Robot faulted with the held unit preserved; QA starves; assembly blocks.',
    expectedActions: 'Restore vacuum through a work order and resume.',
  },
  {
    id: 'quality-drift',
    title: 'Quality drift',
    goal: 'See rejects rise, recalibrate, and keep past decisions unchanged',
    description: 'The QA camera drifts at 2 minutes; visual scores rise until recalibration publishes a new rule version.',
    seed: 842,
    horizonSec: 3600,
    options: { seed: 842, scenarioId: 'quality-drift', scheduled: [fault('QA_CAMERA_DRIFT', 120)] },
    recovery: [
      { at: 900, command: { kind: 'ACK_FAULT', faultId: '@QA_CAMERA_DRIFT' } },
      { at: 900, command: { kind: 'CREATE_WORK_ORDER', faultId: '@QA_CAMERA_DRIFT' } },
      { at: 900, command: { kind: 'START_WORK_ORDER', workOrderId: '@QA_CAMERA_DRIFT' } },
      { at: 900, command: { kind: 'RESOLVE_FAULT', faultId: '@QA_CAMERA_DRIFT' } },
    ],
    affected: ['qa'],
    expectedSymptoms: 'Reject proportion rises sharply; good output slows.',
    expectedActions: 'Recalibrate via work order; only subsequent units use the new rule.',
  },
  {
    id: 'label-stockout',
    title: 'Label stockout',
    goal: 'Queue grows, then recovers after replenishment',
    description: 'Only 160 retail labels are on hand. Packaging blocks when the roll runs out.',
    seed: 842,
    horizonSec: 3600,
    options: { seed: 842, scenarioId: 'label-stockout', materials: { label: 160 } },
    recovery: [{ at: 1200, command: { kind: 'RECEIVE_MATERIAL', material: 'label', qty: 2400 } }],
    affected: ['packaging'],
    expectedSymptoms: 'Packaging blocked on material; good units wait upstream, none are lost.',
    expectedActions: 'Receive labels from the materials ledger.',
  },
  {
    id: 'bottleneck-tuning',
    title: 'Bottleneck tuning',
    goal: 'Faster packaging shifts the constraint upstream',
    description: 'Packaging cycle reduced 4.5 → 3.9 s. The robot (4.2 s) becomes the slowest station.',
    seed: 842,
    horizonSec: 3600,
    options: { seed: 842, scenarioId: 'bottleneck-tuning', config: { packaging: { cycleSeconds: 3.9 } } },
    recovery: [],
    affected: ['packaging', 'robot'],
    expectedSymptoms: 'Higher shipped count; bottleneck moves to robot/assembly.',
    expectedActions: 'Compare against baseline with the same seed and horizon.',
  },
];

export interface RunResult {
  scenarioId: string;
  horizonSec: number;
  shipped: number;
  rejected: number;
  inspected: number;
  oee: number | null;
  downtimeSec: number;
  avgWip: number;
  energyKWh: number;
  whPerGood: number | null;
  bottleneck: StationId | null;
  events: number;
}

export function summarize(s: Session, scenarioId: string, horizonSec: number): RunResult {
  const k = lineKpis(s);
  const c = unitCounts(s);
  const downtime = Object.values(s.stations).reduce((a, st) => a + st.timeIn.faulted + st.timeIn.maintenance, 0);
  const avgWip = s.samples.length ? s.samples.reduce((a, x) => a + x.wip, 0) / s.samples.length : 0;
  return {
    scenarioId,
    horizonSec,
    shipped: k.shipped,
    rejected: c.rejected,
    inspected: k.inspected,
    oee: k.oee?.oee ?? null,
    downtimeSec: downtime,
    avgWip,
    energyKWh: k.energyKWh,
    whPerGood: k.whPerGood,
    bottleneck: k.bottleneck,
    events: s.events.length,
  };
}

/** Deterministic headless run of a scenario (with scripted recovery) to its horizon. */
export function runScenario(sc: Scenario): { session: Session; result: RunResult } {
  const s = createSession({ ...sc.options, scheduled: [...(sc.options.scheduled ?? []), ...sc.recovery] });
  runUntil(s, sc.horizonSec);
  return { session: s, result: summarize(s, sc.id, sc.horizonSec) };
}

export function explainComparison(base: RunResult, variant: RunResult): string {
  const d = variant.shipped - base.shipped;
  const parts: string[] = [];
  parts.push(
    d === 0
      ? `Both runs shipped ${base.shipped} good units in ${base.horizonSec / 60} virtual minutes.`
      : `The variant shipped ${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} good units (${variant.shipped} vs ${base.shipped}) over the same ${base.horizonSec / 60}-minute horizon and seed.`,
  );
  if (variant.downtimeSec - base.downtimeSec > 30)
    parts.push(`Station downtime rose by ${Math.round((variant.downtimeSec - base.downtimeSec) / 60)} min, which accounts for most of the gap.`);
  if (variant.rejected - base.rejected > 5) parts.push(`QA rejected ${variant.rejected - base.rejected} more kits, reducing good output without consuming packaging materials.`);
  if (variant.bottleneck !== base.bottleneck) parts.push(`The busiest station moved from ${base.bottleneck} to ${variant.bottleneck}.`);
  parts.push('Synthetic deterministic runs are not empirical predictions of a real plant.');
  return parts.join(' ');
}
