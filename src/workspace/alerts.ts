import { store } from '../app/store';
import { FAULT_DEF, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import type { Session, StationId } from '../domain/types';

export interface Alert {
  key: string;
  tone: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  station: StationId | null;
  component: string | null;
  action?: { label: string; run: () => void };
}

/** Action-required items only: open faults, low material, a partial case waiting for approval. */
export function alertsOf(s: Session): Alert[] {
  const out: Alert[] = [];
  for (const f of s.faults.filter(isOpenFault)) {
    const def = FAULT_DEF[f.code];
    out.push({ key: f.id, tone: f.severity === 'critical' ? 'critical' : 'warning', title: `${STATION_META[f.station].short} · ${def.title}`, detail: `${f.code} · ${f.status} · ${def.effect}`, station: f.station, component: f.componentId });
  }
  for (const m of Object.values(s.materials))
    if (m.available <= m.reorderPoint && !s.faults.some((f) => isOpenFault(f) && FAULT_DEF[f.code].material === m.id))
      out.push({ key: `mat:${m.id}`, tone: 'warning', title: `${m.name} low`, detail: `${m.available.toLocaleString()} left, reorder point ${m.reorderPoint.toLocaleString()}`, station: m.station, component: null });
  if (s.awaitingPartialApproval)
    out.push({
      key: 'partial',
      tone: 'info',
      title: 'Partial case waiting',
      detail: `The final case holds ${s.cases.find((c) => c.id === s.openCaseId)?.unitIds.length ?? 0} kits`,
      station: 'dispatch',
      component: null,
      action: { label: 'Approve', run: () => store.command({ kind: 'CLOSE_PARTIAL_CASE' }) },
    });
  return out;
}
