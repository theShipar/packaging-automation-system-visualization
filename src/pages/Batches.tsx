import { useMemo, useState } from 'react';
import { useUi } from '../app/store';
import { FAULT_DEF, STATION_META } from '../domain/config';
import { shippedUnits, stagingUnits } from '../domain/engine';
import { SKUS, buildHistory } from '../domain/history';
import { defectPareto, formatClock, lineKpis, unitCounts } from '../domain/kpis';
import type { Session } from '../domain/types';
import { Kpi, PageHead, fmtDate, pct } from '../ui/Page';
import { Select, type SelectOption } from '../ui/Select';
import { ToolLink } from '../workspace/links';

const skuName = (id: string) => SKUS.find((s) => s.id === id)?.name ?? id;
const STATUS_TONE: Record<string, string> = { completed: 'good', partial: 'warn', cancelled: 'crit', planned: '', inProgress: 'blue', released: 'blue' };
const STATUS_LABEL: Record<string, string> = { inProgress: 'In progress', released: 'Released', completed: 'Completed', partial: 'Partial', planned: 'Planned', cancelled: 'Cancelled' };
const STATUS_FILTER: SelectOption<string>[] = [{ value: 'all', label: 'All statuses' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))];

export function BatchesPage() {
  const s = useUi();
  const h = buildHistory();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const c = unitCounts(s);
  const live = {
    id: s.batch.id,
    sku: s.batch.sku,
    status: s.batch.status,
    start: s.batch.releasedAt === null ? null : `virtual ${formatClock(s.batch.releasedAt)}`,
    planned: s.batch.planned,
    committed: s.batch.committedGood,
    dispatched: c.dispatched,
    rejected: c.rejected,
    oee: lineKpis(s).oee?.oee ?? null,
    live: true,
  };
  const rows = useMemo(
    () => [
      live,
      ...[...h.batches].reverse().map((b) => ({ id: b.id, sku: b.sku, status: b.status, start: fmtDate(b.start), planned: b.planned, committed: b.committed, dispatched: b.dispatched, rejected: b.rejected, oee: b.oee, live: false })),
    ],
    [h, live.status, live.dispatched, live.rejected, live.oee],
  ).filter((r) => (status === 'all' || r.status === status) && (r.id + r.sku + skuName(r.sku)).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <PageHead crumbs="Plant A / Line 01" title="Batches" sub={`${h.batches.length + 1} batches · history is a synthetic fixture (seed ${h.seed}); ${s.batch.id} is the live simulated run.`} />
      <div className="filters">
        <input placeholder="Search batch or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search batches" />
        <Select value={status} onChange={setStatus} aria-label="Filter by status" options={STATUS_FILTER} />
        <span className="muted">{rows.length} shown</span>
      </div>
      <div className="card flush scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Batch</th>
              <th>SKU</th>
              <th>Status</th>
              <th>Start</th>
              <th className="r">Planned</th>
              <th className="r">Committed</th>
              <th className="r">Dispatched</th>
              <th className="r">Rejected</th>
              <th className="r">OEE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <ToolLink tool="batches" item={r.id}>{r.id}</ToolLink> {r.live && <span className="tag blue">live</span>}
                </td>
                <td>
                  {skuName(r.sku)} <span className="tert mono">{r.sku}</span>
                </td>
                <td>
                  <span className={`tag ${STATUS_TONE[r.status] ?? ''}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </td>
                <td className="muted">{r.start ?? '—'}</td>
                <td className="r num">{r.planned.toLocaleString()}</td>
                <td className="r num">{r.committed.toLocaleString()}</td>
                <td className="r num">{r.dispatched.toLocaleString()}</td>
                <td className="r num">{r.rejected.toLocaleString()}</td>
                <td className="r num">{pct(r.oee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BatchDetailPage({ id }: { id: string }) {
  const s = useUi();
  if (id === s.batch.id) return <LiveBatch s={s} />;
  const b = buildHistory().batches.find((x) => x.id === id);
  if (!b)
    return (
      <div className="page">
        <BackToBatches />
        <div className="empty">Batch {id} was not found in this run or its history.</div>
      </div>
    );
  const good = b.dispatched;
  return (
    <div className="page">
      <BackToBatches />
      <PageHead crumbs={`Batches / ${b.id}`} title={`${b.id} · ${skuName(b.sku)}`} sub={`${b.order} · ${b.status} · ${fmtDate(b.start)} → ${fmtDate(b.end)} · synthetic history`} />
      <div className="grid4">
        <Kpi t="Dispatched good" v={good.toLocaleString()} n={`of ${b.committed.toLocaleString()} committed`} />
        <Kpi t="Rejected" v={b.rejected.toLocaleString()} n={`${pct(b.released ? b.rejected / b.released : null)} of released`} />
        <Kpi t="OEE" v={pct(b.oee)} n={`availability ${pct(b.availability)}`} />
        <Kpi t="Downtime" v={b.downtimeMin} unit="min" n={`${b.energyKWh.toFixed(0)} kWh energy`} />
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Reconciliation</h3>
          <div className="recon">
            <span>Planned input</span>
            <b>{b.planned.toLocaleString()}</b>
            <span>Released</span>
            <b>{b.released.toLocaleString()}</b>
            <span>− Rejected at QA</span>
            <b>{b.rejected.toLocaleString()}</b>
            <span>− Dispatched</span>
            <b>{b.dispatched.toLocaleString()}</b>
            <span>Unreleased / balance</span>
            <b>{(b.planned - b.rejected - b.dispatched).toLocaleString()}</b>
          </div>
        </div>
        <div className="card">
          <h3>Defects</h3>
          {Object.entries(b.defects).length === 0 ? (
            <div className="empty">None recorded</div>
          ) : (
            <dl className="dl">
              {Object.entries(b.defects).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt className="mono">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      <div className="card flush">
        <table className="tbl">
          <thead>
            <tr>
              <th>Fault</th>
              <th>Station</th>
              <th>When</th>
              <th className="r">Downtime</th>
              <th>Work order</th>
            </tr>
          </thead>
          <tbody>
            {b.faults.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No faults in this batch
                </td>
              </tr>
            )}
            {b.faults.map((f) => (
              <tr key={f.id}>
                <td>
                  {FAULT_DEF[f.code].title} <span className="tert mono">{f.code}</span>
                </td>
                <td>{STATION_META[f.station].short}</td>
                <td className="muted">{fmtDate(f.at)}</td>
                <td className="r num">{f.downtimeMin} min</td>
                <td className="mono">{f.workOrderId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiveBatch({ s }: { s: Session }) {
  const c = unitCounts(s);
  const k = lineKpis(s);
  const pareto = defectPareto(s);
  const sealed = s.cases.filter((x) => x.status !== 'open');
  const balance = c.planned - c.unreleased - c.wip - c.rejected - c.dispatched;
  return (
    <div className="page">
      <BackToBatches />
      <PageHead
        crumbs={`Batches / ${s.batch.id}`}
        title={`${s.batch.id} · ${s.batch.skuName}`}
        sub={
          <>
            Live simulated run {s.runId} · {s.batch.status} · virtual {formatClock(s.t)}
          </>
        }
      />
      <div className="grid4">
        <Kpi t="Dispatched good" v={shippedUnits(s).toLocaleString()} n={`of ${s.batch.committedGood.toLocaleString()} committed`} />
        <Kpi t="QA yield" v={pct(k.yieldPct)} n={`${k.inspected.toLocaleString()} inspected`} />
        <Kpi t="OEE" v={pct(k.oee?.oee ?? null)} n="packaging constraint" />
        <Kpi t="Estimated finish" v={<span style={{ fontSize: 18 }}>{k.eta.label}</span>} n={k.eta.basis} />
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Unit conservation</h3>
          <div className="recon">
            <span>Planned input</span>
            <b>{c.planned.toLocaleString()}</b>
            <span>Unreleased</span>
            <b>{c.unreleased.toLocaleString()}</b>
            <span>Work in progress</span>
            <b>{c.wip.toLocaleString()}</b>
            <span>Rejected at QA (never packed)</span>
            <b>{c.rejected.toLocaleString()}</b>
            <span>Dispatched</span>
            <b>{c.dispatched.toLocaleString()}</b>
            <span>Balance (must be 0)</span>
            <b className={balance === 0 ? '' : 'crit'}>{balance}</b>
          </div>
        </div>
        <div className="card">
          <h3>Packing and shipping</h3>
          <dl className="dl">
            <dt>Packaged</dt>
            <dd>{c.packaged.toLocaleString()}</dd>
            <dt>Retail cartons consumed</dt>
            <dd>{s.materials.retailCarton.consumed.toLocaleString()}</dd>
            <dt>Cases sealed</dt>
            <dd>
              {sealed.length} ({sealed.filter((x) => x.partial).length} partial)
            </dd>
            <dt>Staged in cases</dt>
            <dd>{stagingUnits(s)}</dd>
            <dt>Pallets</dt>
            <dd>{s.pallets.length}</dd>
            <dt>Shipments</dt>
            <dd>{s.shipments.length}</dd>
          </dl>
        </div>
      </div>
      <div className="grid2">
        <div className="card flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Material</th>
                <th>Lot</th>
                <th className="r">Opening</th>
                <th className="r">Received</th>
                <th className="r">Consumed</th>
                <th className="r">Reserved</th>
                <th className="r">Available</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(s.materials).map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className="mono tert">{m.lotId}</td>
                  <td className="r num">{m.opening.toLocaleString()}</td>
                  <td className="r num">{m.receipts.toLocaleString()}</td>
                  <td className="r num">{m.consumed.toLocaleString()}</td>
                  <td className="r num">{m.reserved}</td>
                  <td className="r num">{m.available.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Defects this run</h3>
          {pareto.length === 0 ? (
            <div className="empty">No rejects yet</div>
          ) : (
            <dl className="dl">
              {pareto.map((p) => (
                <div key={p.code} style={{ display: 'contents' }}>
                  <dt className="mono">{p.code}</dt>
                  <dd>{p.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

function BackToBatches() {
  return (
    <ToolLink tool="batches" className="back-link">
      ← All batches
    </ToolLink>
  );
}
