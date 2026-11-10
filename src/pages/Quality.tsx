import { useState } from 'react';
import { useUi } from '../app/store';
import { buildHistory } from '../domain/history';
import { defectPareto, formatClock, lineKpis } from '../domain/kpis';
import type { DefectCode } from '../domain/types';
import { BarChart } from '../ui/Charts';
import { Kpi, PageHead, fmtDate, pct } from '../ui/Page';

export function QualityPage() {
  const s = useUi();
  const h = buildHistory();
  const [scope, setScope] = useState<'live' | 'history'>('live');
  const k = lineKpis(s);
  const live = defectPareto(s);
  const histMap = new Map<DefectCode, number>();
  for (const b of h.batches) for (const [c, n] of Object.entries(b.defects)) histMap.set(c as DefectCode, (histMap.get(c as DefectCode) ?? 0) + (n ?? 0));
  const hist = [...histMap.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  const pareto = scope === 'live' ? live : hist;
  const rejected = s.inspections.filter((i) => i.result === 'reject');
  const histInspected = h.batches.reduce((a, b) => a + b.dispatched + b.rejected, 0);
  const histRejected = h.batches.reduce((a, b) => a + b.rejected, 0);

  return (
    <div className="page">
      <PageHead crumbs="Operations" title="Quality" sub={`Active rule set ${s.qaRule.version}: weight ${s.qaRule.weightMin}–${s.qaRule.weightMax} g, visual score ≤ ${s.qaRule.visualMax}, barcode valid, insert present.`} />
      <div className="grid4">
        <Kpi t="Live first-pass yield" v={pct(k.yieldPct)} n={`${k.inspected.toLocaleString()} inspected`} />
        <Kpi t="Live rejects" v={rejected.length} n={`${s.rejectTray.length} in reject tray`} />
        <Kpi t="History yield" v={pct(histInspected ? 1 - histRejected / histInspected : null)} n={`${histInspected.toLocaleString()} units, ${h.batches.length} batches`} />
        <Kpi t="Camera drift (sim)" v={s.qaDrift.toFixed(2)} n={s.barcodeDegraded ? 'barcode reader degraded' : 'nominal'} />
      </div>
      <div className="grid2">
        <div className="card">
          <div className="card-h">
            <h3>Defect Pareto</h3>
            <div className="seg">
              {(['live', 'history'] as const).map((x) => (
                <button key={x} className={scope === x ? 'on' : ''} onClick={() => setScope(x)}>
                  {x}
                </button>
              ))}
            </div>
          </div>
          {pareto.length ? <BarChart label="Defect Pareto" bars={pareto.map((p) => ({ x: p.code.split('_')[0], v: p.count, title: `${p.code}: ${p.count}` }))} /> : <div className="empty">No rejects yet in this scope</div>}
          <dl className="dl">
            {pareto.map((p) => (
              <div key={p.code} style={{ display: 'contents' }}>
                <dt className="mono">{p.code}</dt>
                <dd>{p.count}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="card flush scroll" style={{ maxHeight: 380 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Serial</th>
                <th className="r">Weight</th>
                <th className="r">Visual</th>
                <th>Rule</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {s.inspections.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No inspections yet
                  </td>
                </tr>
              )}
              {s.inspections
                .slice(-120)
                .reverse()
                .map((i) => (
                  <tr key={i.id}>
                    <td className="mono tert">{i.id}</td>
                    <td className="mono">{i.serial}</td>
                    <td className="r num">{i.weight} g</td>
                    <td className="r num">{i.visualScore}</td>
                    <td className="mono tert">{i.ruleVersion}</td>
                    <td>{i.result === 'pass' ? <span className="tag good">pass</span> : <span className="tag crit">{i.codes.join(', ')}</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <h2>Reject log</h2>
      <div className="card flush scroll" style={{ maxHeight: 420 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Serial</th>
              <th>Batch</th>
              <th>When</th>
              <th>Defect</th>
              <th className="r">Weight</th>
              <th className="r">Visual</th>
              <th>Rule</th>
            </tr>
          </thead>
          <tbody>
            {[...rejected].reverse().map((i) => (
              <tr key={i.id}>
                <td className="mono">
                  {i.serial} <span className="tag blue">live</span>
                </td>
                <td className="mono">{s.batch.id}</td>
                <td className="muted num">virtual {formatClock(i.at)}</td>
                <td className="mono">{i.codes.join(', ')}</td>
                <td className="r num">{i.weight}</td>
                <td className="r num">{i.visualScore}</td>
                <td className="mono tert">{i.ruleVersion}</td>
              </tr>
            ))}
            {h.rejects
              .slice(-200)
              .reverse()
              .map((r) => (
                <tr key={r.serial}>
                  <td className="mono">{r.serial}</td>
                  <td className="mono">{r.batchId}</td>
                  <td className="muted">{fmtDate(r.at)}</td>
                  <td className="mono">{r.code}</td>
                  <td className="r num">{r.weight}</td>
                  <td className="r num">{r.visualScore}</td>
                  <td className="mono tert">{r.ruleVersion}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
