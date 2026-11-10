import { store, useUi } from '../app/store';
import { lineKpis, unitCounts } from '../domain/kpis';
import { workspace } from './workspaceStore';

/** One compact line of batch truth at the bottom of the canvas. Click opens the live batch. */
export function StatusRail() {
  const s = useUi();
  const k = lineKpis(s);
  const c = unitCounts(s);
  const pct = Math.min(1, k.shipped / Math.max(1, s.batch.committedGood));
  const partial = s.awaitingPartialApproval;
  const done = s.status === 'completed';
  return (
    <div className="status-rail" role="group" aria-label="Batch status">
      <button className="sr-main" onClick={() => workspace.openTool('batches', s.batch.id)} title="Open the live batch and its reconciliation">
        <span className="sr-item sr-ship">
          <span className="k">Shipped</span>
          <b className="num">
            {k.shipped.toLocaleString()}
            <span className="of"> / {s.batch.committedGood.toLocaleString()}</span>
          </b>
          <span className="bar" aria-hidden>
            <i style={{ width: `${pct * 100}%` }} />
          </span>
        </span>
        <span className="sr-item sr-wip" title="Units released and not yet shipped or rejected">
          <span className="k">WIP</span>
          <b className="num">{c.wip.toLocaleString()}</b>
        </span>
        <span className={`sr-item${c.rejected ? ' warn' : ''}`} title="Rejected at QA (never packed)">
          <span className="k">Rejects</span>
          <b className="num">{c.rejected.toLocaleString()}</b>
        </span>
        <span className="sr-item sr-rem" title="Good units still needed to reach the committed quantity">
          <span className="k">Remaining</span>
          <b className="num">{k.remainingGood.toLocaleString()}</b>
        </span>
        <span className="sr-item sr-eta" title={k.eta.basis}>
          <span className="k">ETA</span>
          <b>{k.eta.label}</b>
        </span>
      </button>
      {partial && (
        <button className="btn sm primary sr-action" onClick={() => store.command({ kind: 'CLOSE_PARTIAL_CASE' })} title={`Final case holds ${s.cases.find((x) => x.id === s.openCaseId)?.unitIds.length ?? 0} kits`}>
          Approve partial case
        </button>
      )}
      {done && (
        <button className="btn sm sr-action" onClick={() => workspace.openTool('batches', s.batch.id)}>
          Batch {s.batch.status} · Reconciliation
        </button>
      )}
    </div>
  );
}
