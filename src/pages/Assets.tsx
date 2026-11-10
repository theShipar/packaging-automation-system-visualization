import { Link, useParams } from 'react-router-dom';
import { useUi } from '../app/store';
import { COMPONENTS, FAULTS, FAULT_DEF, STATIONS, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { buildHistory } from '../domain/history';
import { effectiveStatus, formatClock } from '../domain/kpis';
import { PageHead, fmtDate } from '../ui/Page';
import { StatusPill } from '../ui/Status';
import { StationThumb } from '../vector/StationThumb';

export function AssetsPage() {
  const s = useUi();
  return (
    <div className="page">
      <PageHead crumbs="Operations" title="Assets" sub={`${COMPONENTS.length} simulated components across six stations. IDs follow the plant naming scheme; none are connected to real devices.`} />
      <div className="grid3">
        {STATIONS.map((m) => {
          const comps = COMPONENTS.filter((c) => c.station === m.id);
          return (
            <div key={m.id} className="card">
              <div className="card-h">
                <h3>
                  <span className="tert num">{m.no}</span> {m.name}
                </h3>
                <StatusPill status={effectiveStatus(s, m.id)} />
              </div>
              <div className="asset-thumb">
                <StationThumb id={m.id} hiComp={null} />
              </div>
              {comps.map((c) => {
                const open = s.faults.find((f) => f.componentId === c.id && isOpenFault(f));
                return (
                  <Link key={c.id} to={`/assets/${c.id}`} className="asset-row">
                    <span>{c.name}</span>
                    <span className="row">
                      {open && <span className="tag crit">{open.code}</span>}
                      <span className="mono tert">{c.id}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AssetDetailPage() {
  const { id } = useParams();
  const s = useUi();
  const c = COMPONENTS.find((x) => x.id === id);
  if (!c)
    return (
      <div className="page">
        <h1>Asset {id} not found</h1>
        <Link to="/assets">All assets</Link>
      </div>
    );
  const codes = FAULTS.filter((f) => f.componentId === c.id).map((f) => f.code);
  const live = s.faults.filter((f) => f.componentId === c.id);
  const h = buildHistory();
  const hist = h.batches.flatMap((b) => b.faults.filter((f) => codes.includes(f.code)).map((f) => ({ ...f, batch: b.id })));
  const wos = h.workOrders.filter((w) => w.assetId === c.id);
  const st = s.stations[c.station];
  return (
    <div className="page">
      <PageHead
        crumbs={`Assets / ${STATION_META[c.station].name}`}
        title={c.name}
        sub={
          <>
            <span className="mono">{c.id}</span> · {c.kind} · <Link to={`/production?station=${c.station}`}>Show on line</Link>
          </>
        }
      />
      <div className="grid2">
        <div className="card">
          <StationThumb id={c.station} hiComp={c.id} />
        </div>
        <div className="card">
          <h3>About</h3>
          <p style={{ marginTop: 0 }}>{c.note}.</p>
          <dl className="dl">
            <dt>Station</dt>
            <dd>{STATION_META[c.station].name}</dd>
            <dt>Station cycles this run</dt>
            <dd>{st.completed.toLocaleString()}</dd>
            <dt>Running time this run</dt>
            <dd>{(st.timeIn.processing / 60).toFixed(1)} min</dd>
            <dt>Known failure modes</dt>
            <dd>{codes.length ? codes.join(', ') : 'none modelled'}</dd>
            <dt>History incidents</dt>
            <dd>{hist.length}</dd>
          </dl>
        </div>
      </div>
      <h2>Incidents</h2>
      <div className="card flush scroll" style={{ maxHeight: 420 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Fault</th>
              <th>Batch</th>
              <th>When</th>
              <th>Status / downtime</th>
              <th>Work order</th>
            </tr>
          </thead>
          <tbody>
            {live.length + hist.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No incidents recorded
                </td>
              </tr>
            )}
            {live.map((f) => (
              <tr key={f.id}>
                <td>
                  {FAULT_DEF[f.code].title} <span className="tag blue">live</span>
                </td>
                <td className="mono">{s.batch.id}</td>
                <td className="muted num">virtual {formatClock(f.raisedAt)}</td>
                <td>{f.status}</td>
                <td className="mono">{f.workOrderId ?? '—'}</td>
              </tr>
            ))}
            {[...hist].reverse().map((f) => (
              <tr key={f.id}>
                <td>{FAULT_DEF[f.code].title}</td>
                <td className="mono">{f.batch}</td>
                <td className="muted">{fmtDate(f.at)}</td>
                <td className="num">{f.downtimeMin} min</td>
                <td className="mono">{f.workOrderId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wos.length > 0 && (
        <>
          <h2>Work orders</h2>
          <div className="card flush">
            <table className="tbl">
              <tbody>
                {wos.map((w) => (
                  <tr key={w.id}>
                    <td className="mono">{w.id}</td>
                    <td>{w.description}</td>
                    <td>{w.status}</td>
                    <td className="muted">{fmtDate(w.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
