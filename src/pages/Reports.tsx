import { useRef, useState } from 'react';
import { exportEventsCsv, exportJson, exportUnitsCsv, importJson, printReport } from '../app/exports';
import { store, useUi } from '../app/store';
import { lineKpis, unitCounts } from '../domain/kpis';
import { IcoDownload } from '../ui/Icons';
import { PageHead, pct } from '../ui/Page';

export function ReportsPage() {
  const s = useUi();
  const k = lineKpis(s);
  const c = unitCounts(s);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="page">
      <PageHead crumbs="Operations" title="Reports and data" sub={`Current run ${s.runId} · batch ${s.batch.id} · ${s.events.length.toLocaleString()} events. Exports are generated locally; nothing leaves this browser.`} />
      <div className="grid3">
        <div className="card">
          <h3>Shift report</h3>
          <p className="muted">Printable HTML summary: KPIs, reconciliation, faults and materials. Use the browser's print dialog to save as PDF.</p>
          <button className="btn blue" onClick={() => printReport(s)}>
            Open printable report
          </button>
        </div>
        <div className="card">
          <h3>Run export (JSON)</h3>
          <p className="muted">Full session with seed, settings, events and a checksum. Re-import it below to restore the exact state.</p>
          <button className="btn" onClick={() => exportJson(s)}>
            <IcoDownload /> Download JSON
          </button>
        </div>
        <div className="card">
          <h3>Tables (CSV)</h3>
          <p className="muted">Event log and unit genealogy (serial, station, inspection, case, shipment).</p>
          <div className="row wrap">
            <button className="btn" onClick={() => exportEventsCsv(s)}>
              <IcoDownload /> Events CSV
            </button>
            <button className="btn" onClick={() => exportUnitsCsv(s)}>
              <IcoDownload /> Units CSV
            </button>
          </div>
        </div>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Import a run</h3>
          <p className="muted">
            Accepts a LineFlow JSON export (max 60 MB). The file is schema-validated, its engine version and checksum are checked, and invariants are verified before anything is
            replaced. Imported files are data only — nothing in them is executed.
          </p>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = await importJson(f);
              if (r.ok) {
                store.importSession(r.session);
                setMsg(`Imported ${r.session.runId} at virtual ${Math.round(r.session.t)} s (paused).`);
              } else setMsg(`Import rejected: ${r.reason}`);
              if (file.current) file.current.value = '';
            }}
          />
          {msg && <p className="muted">{msg}</p>}
        </div>
        <div className="card">
          <h3>Snapshot</h3>
          <dl className="dl">
            <dt>Dispatched / committed</dt>
            <dd>
              {c.dispatched.toLocaleString()} / {s.batch.committedGood.toLocaleString()}
            </dd>
            <dt>Rejected</dt>
            <dd>{c.rejected}</dd>
            <dt>OEE</dt>
            <dd>{pct(k.oee?.oee ?? null)}</dd>
            <dt>Energy</dt>
            <dd>{k.energyKWh.toFixed(1)} kWh</dd>
            <dt>Last saved</dt>
            <dd>{store.savedAt ? new Date(store.savedAt).toLocaleTimeString() : 'not yet'}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
