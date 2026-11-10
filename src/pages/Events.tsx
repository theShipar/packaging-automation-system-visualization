import { useState } from 'react';
import { exportEventsCsv } from '../app/exports';
import { useUi } from '../app/store';
import { STATIONS, STATION_META } from '../domain/config';
import { buildHistory } from '../domain/history';
import { formatClock } from '../domain/kpis';
import { IcoDownload } from '../ui/Icons';
import { PageHead, fmtDate } from '../ui/Page';
import { useWorkspace, workspace } from '../workspace/workspaceStore';
import type { StationId } from '../domain/types';

const NOISE = new Set(['STATION_CYCLE_STARTED', 'STATION_CYCLE_COMPLETED', 'UNIT_RELEASED', 'MATERIAL_CONSUMED', 'QA_INSPECTION_PASSED', 'CASE_OPENED', 'TRANSFER_RESERVED', 'TRANSFER_STARTED', 'TRANSFER_COMPLETED']);

interface Row {
  id: string;
  when: string;
  type: string;
  station: string | null;
  severity: string;
  batch: string;
  message: string;
  live: boolean;
}

export function EventsPage() {
  const s = useUi();
  const station = useWorkspace().station ?? 'all';
  const [sev, setSev] = useState('all');
  const [q, setQ] = useState('');
  const [noise, setNoise] = useState(false);
  const [hist, setHist] = useState(false);
  const [limit, setLimit] = useState(200);

  const rows: Row[] = [];
  const match = (r: Row) =>
    (station === 'all' || r.station === station) && (sev === 'all' || r.severity === sev) && (!q || (r.type + r.message + r.batch).toLowerCase().includes(q.toLowerCase()));
  for (let i = s.events.length - 1; i >= 0 && rows.length < limit; i--) {
    const e = s.events[i];
    if (!noise && NOISE.has(e.type)) continue;
    const r = { id: e.id, when: `virtual ${formatClock(e.virtualAt)}`, type: e.type, station: e.stationId, severity: e.severity, batch: e.batchId, message: e.message, live: true };
    if (match(r)) rows.push(r);
  }
  if (hist) {
    const h = buildHistory().events;
    for (let i = h.length - 1; i >= 0 && rows.length < limit; i--) {
      const e = h[i];
      const r = { id: e.id, when: fmtDate(e.at), type: e.type, station: e.station, severity: e.severity, batch: e.batchId, message: e.message, live: false };
      if (match(r)) rows.push(r);
    }
  }

  return (
    <div className="page">
      <PageHead
        crumbs="Operations"
        title="Events"
        sub={`${s.events.length.toLocaleString()} events in live run ${s.runId}. Append-only; virtual timestamps.`}
        actions={
          <button className="btn" onClick={() => exportEventsCsv(s)}>
            <IcoDownload /> Export CSV
          </button>
        }
      />
      <div className="filters">
        <input placeholder="Search type, message, batch" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
        <select
          value={station}
          onChange={(e) => workspace.select(e.target.value === 'all' ? null : (e.target.value as StationId), { inspector: workspace.get().inspectorOpen })}
          aria-label="Station (follows the canvas selection)"
        >
          <option value="all">All stations</option>
          {STATIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Severity">
          {['all', 'info', 'warning', 'critical'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <label className="row">
          <input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} /> Cycle events
        </label>
        <label className="row">
          <input type="checkbox" checked={hist} onChange={(e) => setHist(e.target.checked)} /> Include history
        </label>
      </div>
      <div className="card flush scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Station</th>
              <th>Batch</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No events match. Start the line or widen the filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={(r.live ? 'L' : 'H') + r.id}>
                <td className="muted num" style={{ whiteSpace: 'nowrap' }}>
                  {r.when}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span className={`sev ${r.severity}`} />
                  <span className="mono">{r.type}</span>
                </td>
                <td>{r.station ? STATION_META[r.station as keyof typeof STATION_META]?.short : '—'}</td>
                <td className="mono">{r.batch}</td>
                <td>{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length >= limit && (
        <button className="btn" onClick={() => setLimit(limit + 300)}>
          Show more
        </button>
      )}
    </div>
  );
}
