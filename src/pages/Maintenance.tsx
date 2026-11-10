import { Link } from 'react-router-dom';
import { useUi } from '../app/store';
import { FAULT_DEF, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { buildHistory } from '../domain/history';
import { formatClock } from '../domain/kpis';
import { Kpi, PageHead, fmtDate } from '../ui/Page';

export function MaintenancePage() {
  const s = useUi();
  const h = buildHistory();
  const open = s.faults.filter(isOpenFault);
  const pm = h.days.filter((d) => d.maintenanceWindow).slice(-6);
  const mttr = (() => {
    const closed = s.faults.filter((f) => f.resolvedAt !== null);
    if (!closed.length) return null;
    return closed.reduce((a, f) => a + (f.resolvedAt! - f.raisedAt), 0) / closed.length;
  })();
  return (
    <div className="page">
      <PageHead crumbs="Operations" title="Maintenance" sub="Simulated faults and work orders. Nothing here controls real equipment." />
      <div className="grid4">
        <Kpi t="Open faults" v={open.length} n={`${open.filter((f) => f.severity === 'critical').length} critical`} />
        <Kpi t="Work orders this run" v={s.workOrders.length} n={`${s.workOrders.filter((w) => w.status !== 'closed').length} not closed`} />
        <Kpi t="MTTR this run" v={mttr === null ? '—' : Math.round(mttr)} unit={mttr === null ? undefined : 's'} n="raised → resolved, virtual" />
        <Kpi t="History work orders" v={h.workOrders.length} n={`${h.workOrders.filter((w) => w.code === 'PM').length} preventive`} />
      </div>
      <h2>Live faults</h2>
      <div className="card flush scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fault</th>
              <th>Station / asset</th>
              <th>Status</th>
              <th>Raised</th>
              <th>Work order</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.faults.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No faults in this run. Use “Simulate issue” in a station inspector or load a scenario.
                </td>
              </tr>
            )}
            {[...s.faults].reverse().map((f) => (
              <tr key={f.id}>
                <td className="mono">{f.id}</td>
                <td>
                  {FAULT_DEF[f.code].title} <span className={`tag ${f.severity === 'critical' ? 'crit' : 'warn'}`}>{f.severity}</span>
                </td>
                <td>
                  {STATION_META[f.station].short} · <span className="mono">{f.componentId}</span>
                </td>
                <td>
                  <span className={`tag ${isOpenFault(f) ? 'warn' : 'good'}`}>{f.status}</span>
                </td>
                <td className="num muted">{formatClock(f.raisedAt)}</td>
                <td className="mono">{f.workOrderId ?? '—'}</td>
                <td>{isOpenFault(f) && <Link to={`/production?station=${f.station}`}>Handle →</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Work orders</h2>
      <div className="card flush scroll" style={{ maxHeight: 420 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ID</th>
              <th>Asset</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Created</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {[...s.workOrders].reverse().map((w) => (
              <tr key={w.id}>
                <td className="mono">
                  {w.id} <span className="tag blue">live</span>
                </td>
                <td className="mono">{w.assetId}</td>
                <td>{w.priority}</td>
                <td>{w.status}</td>
                <td className="muted num">virtual {formatClock(w.createdAt)}</td>
                <td>{w.description}</td>
              </tr>
            ))}
            {[...h.workOrders].reverse().map((w) => (
              <tr key={w.id}>
                <td className="mono">{w.id}</td>
                <td className="mono">{w.assetId}</td>
                <td>{w.priority}</td>
                <td>{w.status}</td>
                <td className="muted">{fmtDate(w.created)}</td>
                <td>{w.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Preventive maintenance windows</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Alternate Saturdays, 06:00–10:00. The line does not run during a window.
        </p>
        <div className="row wrap">
          {pm.map((d) => (
            <span key={d.date} className="tag">
              {d.date}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
