import { unitOf } from '../../domain/core';
import type { Session, StationId } from '../../domain/types';
import { describeUnit, frameUnits } from '../../transport/poses';

export interface TraceRow {
  t: number;
  type: string;
  station: StationId | null;
  message: string;
}

/** Timeline of every event that touched a unit, its case or its shipment, oldest first. */
export function traceUnit(s: Session, unitId: string): TraceRow[] {
  const u = s.units.find((x) => x.id === unitId || x.serial === unitId);
  if (!u) return [];
  const mine = (e: Session['events'][number]) => {
    if (e.unitId === u.id) return true;
    const p = e.payload as { caseId?: string; shipmentId?: string };
    return (!!u.caseId && p.caseId === u.caseId) || (!!u.shipmentId && p.shipmentId === u.shipmentId);
  };
  return s.events
    .filter(mine)
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({ t: e.virtualAt, type: e.type, station: e.stationId, message: e.message }));
}

/** Current logical and visual state of one unit, for the dev console. */
export function unitNow(s: Session, unitId: string) {
  const u = unitOf(s, unitId);
  const pose = frameUnits(s).find((p) => p.id === u.id) ?? null;
  return { id: u.id, serial: u.serial, slot: u.slot, station: u.station, track: u.track, pose, story: describeUnit(s, u) };
}

export function installTrace(get: () => Session, store?: unknown) {
  const w = window as unknown as Record<string, unknown>;
  if (store) w.lfStore = store;
  w.traceUnit = (id: string) => {
    const rows = traceUnit(get(), id);
    console.table(rows);
    return rows;
  };
  w.unitNow = (id: string) => unitNow(get(), id);
}
