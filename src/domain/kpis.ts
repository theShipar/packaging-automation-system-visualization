import { STATION_META } from './config';
import { isOpenFault, shippedUnits, stagingUnits } from './engine';
import { unitOf } from './core';
import { STATION_IDS, type DefectCode, type Session, type StationId, type StationStatus } from './types';

export interface UnitCounts {
  planned: number;
  unreleased: number;
  released: number;
  wip: number;
  rejected: number;
  dispatched: number;
  qaPassed: number;
  acceptedAwaiting: number;
  packaged: number;
  packedAwaiting: number;
}

export function unitCounts(s: Session): UnitCounts {
  const c: UnitCounts = { planned: s.units.length, unreleased: 0, released: 0, wip: 0, rejected: 0, dispatched: 0, qaPassed: 0, acceptedAwaiting: 0, packaged: 0, packedAwaiting: 0 };
  for (const u of s.units) {
    if (u.state === 'unreleased') {
      c.unreleased++;
      continue;
    }
    c.released++;
    if (u.state === 'rejected') c.rejected++;
    else if (u.state === 'dispatched') c.dispatched++;
    else c.wip++;
    if (u.qaPassed) c.qaPassed++;
    if (u.qaPassed && !u.packaged) c.acceptedAwaiting++;
    if (u.packaged) c.packaged++;
    if (u.packaged && u.state !== 'dispatched') c.packedAwaiting++;
  }
  return c;
}

/** Status shown to users: a line pause overlays non-latched machine states. */
export function effectiveStatus(s: Session, id: StationId): StationStatus {
  const st = s.stations[id].status;
  if (s.status === 'paused' && st !== 'faulted' && st !== 'maintenance') return 'paused';
  return st;
}

export interface StationView {
  id: StationId;
  status: StationStatus;
  /** Units that have arrived in the input buffer. */
  inQueue: number;
  /** Reserved input slots: units still on the transfer lane. */
  incoming: number;
  outQueue: number;
  inCap: number;
  outCap: number;
  progress: number | null;
  currentUnit: string | null;
  completed: number;
  throughputHr: number;
  utilization: number | null;
  avgCycle: number | null;
  energyKWh: number;
  blockReason: string | null;
  openFaults: number;
}

export function stationView(s: Session, id: StationId): StationView {
  const st = s.stations[id];
  const cfg = s.config[id];
  const j = st.current;
  let progress: number | null = null;
  if (j) {
    if (j.done) progress = 1;
    else if (j.finishAt !== null) progress = Math.min(1, Math.max(0, (s.t - j.startAt) / j.duration));
    else progress = Math.min(1, Math.max(0, 1 - j.remaining / j.duration));
  }
  const win = Math.min(900, s.t);
  const recent = st.completionTimes.filter((t) => t > s.t - 900).length;
  const total = Object.values(st.timeIn).reduce((a, b) => a + b, 0);
  const cycles = st.recentCycles;
  return {
    id,
    status: effectiveStatus(s, id),
    inQueue: st.inQ.length,
    incoming: st.incoming,
    outQueue: id === 'dispatch' ? stagingUnits(s) : st.outQ.length,
    inCap: cfg.bufferIn,
    outCap: cfg.bufferOut,
    progress,
    currentUnit: j ? unitOf(s, j.unitId).serial : null,
    completed: st.completed,
    throughputHr: win >= 60 ? Math.round((recent / win) * 3600) : 0,
    utilization: total >= 60 ? st.timeIn.processing / total : null,
    avgCycle: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null,
    energyKWh: st.energyKWh,
    blockReason: st.blockReason ?? (j?.done ? 'Output buffer full' : null),
    openFaults: s.faults.filter((f) => f.station === id && isOpenFault(f)).length,
  };
}

export interface LineKpis {
  shipped: number;
  remainingGood: number;
  throughputHr: number;
  throughputWindowSec: number;
  yieldPct: number | null;
  inspected: number;
  oee: { a: number; p: number; q: number; oee: number } | null;
  energyKWh: number;
  whPerGood: number | null;
  eta: { label: string; seconds: number | null; basis: string };
  bottleneck: StationId | null;
  openFaults: number;
  criticalFaults: number;
}

export function lineKpis(s: Session): LineKpis {
  const shipped = shippedUnits(s);
  const remainingGood = Math.max(0, s.batch.committedGood - shipped);
  const win = Math.min(900, s.t);
  let recent = 0;
  for (const sh of s.shipments) if (sh.at > s.t - 900) recent += sh.units;
  const throughputHr = win >= 60 ? (recent / win) * 3600 : 0;
  const inspected = s.inspections.length;
  const passed = s.inspections.filter((i) => i.result === 'pass').length;
  const yieldPct = inspected ? passed / inspected : null;

  let oee: LineKpis['oee'] = null;
  const pk = s.stations.packaging;
  const elapsed = Object.values(pk.timeIn).reduce((a, b) => a + b, 0);
  if (elapsed >= 120 && inspected > 0) {
    const down = pk.timeIn.faulted + pk.timeIn.maintenance;
    const run = Math.max(1e-6, elapsed - down);
    const a = run / elapsed;
    const p = Math.min(1, (s.config.packaging.cycleSeconds * pk.completed) / run);
    const q = yieldPct ?? 1;
    oee = { a, p, q, oee: Math.min(1, a * p * q) };
  }

  let energy = 0;
  for (const id of STATION_IDS) energy += s.stations[id].energyKWh;

  const stopped = s.faults.some((f) => f.kind === 'stop' && isOpenFault(f));
  let eta: LineKpis['eta'];
  if (remainingGood === 0) eta = { label: 'Committed quantity shipped', seconds: 0, basis: 'shipped ≥ committed' };
  else if (s.status === 'ready') eta = { label: 'Not started', seconds: null, basis: 'press Start to release the batch' };
  else if (stopped && s.status !== 'paused') eta = { label: 'Delayed — line stopped', seconds: null, basis: 'open stop fault' };
  else {
    const maxCycle = Math.max(...STATION_IDS.map((id) => s.config[id].cycleSeconds));
    const modelled = (3600 / maxCycle) * (yieldPct ?? 0.985) * 0.95;
    const useObserved = s.t >= 600 && throughputHr > 0;
    const rate = useObserved ? throughputHr : modelled;
    const seconds = (remainingGood / rate) * 3600;
    eta = {
      label: `≈ ${formatDuration(seconds)}`,
      seconds,
      basis: useObserved ? `rolling 15-min shipped rate ${Math.round(rate)}/h` : `modelled ${Math.round(modelled)}/h (bottleneck × yield × 95% uptime)`,
    };
  }

  // Several stations can sit near 100% busy while WIP fills; among the saturated ones the slowest cycle is the constraint.
  const share = (id: StationId) => {
    const st = s.stations[id];
    const total = Object.values(st.timeIn).reduce((a, b) => a + b, 0);
    return total > 60 ? (st.timeIn.processing + st.timeIn.faulted + st.timeIn.maintenance) / total : null;
  };
  const cycleOf = (id: StationId) => {
    const c = s.stations[id].recentCycles;
    return c.length ? c.reduce((a, b) => a + b, 0) / c.length : s.config[id].cycleSeconds;
  };
  const shares = STATION_IDS.map((id) => [id, share(id)] as const);
  const maxShare = Math.max(...shares.map(([, v]) => v ?? 0));
  const saturated = maxShare > 0 ? shares.filter(([, v]) => v !== null && v >= maxShare - 0.03).map(([id]) => id) : [...STATION_IDS];
  let bottleneck: StationId | null = null;
  for (const id of saturated) if (bottleneck === null || cycleOf(id) > cycleOf(bottleneck)) bottleneck = id;
  const open = s.faults.filter(isOpenFault);
  return {
    shipped,
    remainingGood,
    throughputHr,
    throughputWindowSec: win,
    yieldPct,
    inspected,
    oee,
    energyKWh: energy,
    whPerGood: shipped ? (energy * 1000) / shipped : null,
    eta,
    bottleneck,
    openFaults: open.length,
    criticalFaults: open.filter((f) => f.severity === 'critical').length,
  };
}

export function defectPareto(s: Session): { code: DefectCode; count: number }[] {
  const m = new Map<DefectCode, number>();
  for (const i of s.inspections) for (const c of i.codes) m.set(c, (m.get(c) ?? 0) + 1);
  return [...m.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min`;
  return `${Math.max(0, Math.round(sec))} s`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export const stationName = (id: StationId) => STATION_META[id].name;
