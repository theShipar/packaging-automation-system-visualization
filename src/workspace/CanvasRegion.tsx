import { useUi } from '../app/store';
import { FAULT_DEF, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { formatClock } from '../domain/kpis';
import type { Session } from '../domain/types';
import { Scene } from '../vector/Scene';
import { StatusRail } from './StatusRail';
import { useWorkspace, workspace } from './workspaceStore';

const NOISE = new Set(['STATION_CYCLE_STARTED', 'STATION_CYCLE_COMPLETED', 'UNIT_RELEASED', 'MATERIAL_CONSUMED', 'QA_INSPECTION_PASSED', 'CASE_OPENED', 'TRANSFER_RESERVED', 'TRANSFER_STARTED', 'TRANSFER_COMPLETED']);

/** The canvas owns the remaining space; overlays float over it and never push it. */
export function CanvasRegion() {
  const w = useWorkspace();
  const s = useUi();
  return (
    <main className="ws-canvas" aria-label="Production canvas">
      <Scene selected={w.station} selectedComp={w.comp} onSelect={(id) => workspace.select(id)} onSelectComp={(c) => w.station && workspace.selectComponent(w.station, c)} />
      <div className="ov ov-top">
        <CriticalNotice s={s} />
        <LatestEvent s={s} />
      </div>
      {s.status === 'ready' && (
        <div className="ov ov-hint" role="note">
          Press <b>Start</b> to release the first {s.config.intake.feedReleaseSize} units.
        </div>
      )}
      <div className="ov ov-bottom">
        <StatusRail />
      </div>
    </main>
  );
}

function CriticalNotice({ s }: { s: Session }) {
  const f = s.faults.find((x) => isOpenFault(x) && x.severity === 'critical');
  if (!f) return null;
  return (
    <button
      className="notice crit"
      role="alert"
      onClick={() => {
        workspace.selectComponent(f.station, f.componentId);
        workspace.openInspector('overview');
      }}
    >
      <span className="pip" aria-hidden />
      <b>{STATION_META[f.station].short}</b> · {FAULT_DEF[f.code].title} <span className="mono">{f.code}</span>
      <span className="go">Inspect</span>
    </button>
  );
}

function LatestEvent({ s }: { s: Session }) {
  let e = null;
  for (let i = s.events.length - 1; i >= 0; i--)
    if (!NOISE.has(s.events[i].type)) {
      e = s.events[i];
      break;
    }
  if (!e) return null;
  const station = e.stationId;
  return (
    <button className="notice latest" onClick={() => (station ? workspace.select(station) : workspace.openTool('events'))} title={`${e.message} — the full log is in Events`}>
      <span className={`sev ${e.severity}`} aria-hidden />
      <span className="num muted">{formatClock(e.virtualAt)}</span>
      <span className="msg">{e.message}</span>
    </button>
  );
}
