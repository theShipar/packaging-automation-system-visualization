import { z } from 'zod';
import { ENGINE_VERSION, STATION_META } from '../domain/config';
import { checkInvariants } from '../domain/invariants';
import { formatClock, lineKpis, unitCounts } from '../domain/kpis';
import { hashString } from '../domain/rng';
import { STATION_IDS, type Session } from '../domain/types';

const SCHEMA = 'lineflow.export/1';

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportJson(s: Session) {
  const counts = unitCounts(s);
  const body = JSON.stringify(s);
  const doc = {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    origin: 'LineFlow simulation — synthetic demo data, not factory telemetry',
    engineVersion: ENGINE_VERSION,
    run: { runId: s.runId, scenarioId: s.scenarioId, seed: s.seed, virtualSeconds: s.t },
    batchTotals: counts,
    checksum: hashString(body).toString(16),
    session: s,
  };
  download(`lineflow-${s.runId}-${s.batch.id}.json`, 'application/json', JSON.stringify(doc));
}

const csvCell = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}

export function exportEventsCsv(s: Session) {
  const rows = s.events.map((e) => ({
    sequence: e.seq,
    id: e.id,
    virtual_seconds: e.virtualAt,
    virtual_clock: formatClock(e.virtualAt),
    type: e.type,
    severity: e.severity,
    station: e.stationId ?? '',
    unit: e.unitId ?? '',
    batch: e.batchId,
    actor: e.actor,
    source: e.source,
    message: e.message,
  }));
  download(`lineflow-${s.runId}-events.csv`, 'text/csv', toCsv(rows));
}

export function exportUnitsCsv(s: Session) {
  const rows = s.units
    .filter((u) => u.state !== 'unreleased')
    .map((u) => ({
      unit: u.id,
      serial: u.serial,
      state: u.state,
      station: u.station ?? '',
      released_at: u.releasedAt ?? '',
      qa_passed: u.qaPassed,
      inspection: u.inspectionId ?? '',
      case: u.caseId ?? '',
      shipment: u.shipmentId ?? '',
      rejected_at: u.rejectedAt ?? '',
      dispatched_at: u.dispatchedAt ?? '',
    }));
  download(`lineflow-${s.runId}-units.csv`, 'text/csv', toCsv(rows));
}

export function printReport(s: Session) {
  const c = unitCounts(s);
  const k = lineKpis(s);
  const w = window.open('', '_blank');
  if (!w) return;
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  const stations = STATION_IDS.map((id) => {
    const st = s.stations[id];
    const total = Object.values(st.timeIn).reduce((a, b) => a + b, 0) || 1;
    return `<tr><td>${STATION_META[id].no} ${STATION_META[id].name}</td><td>${st.completed}</td><td>${pct(st.timeIn.processing / total)}</td><td>${Math.round((st.timeIn.faulted + st.timeIn.maintenance) / 60)} min</td><td>${st.energyKWh.toFixed(2)} kWh</td></tr>`;
  }).join('');
  const faults = s.faults
    .map((f) => `<tr><td>${f.id}</td><td>${f.code}</td><td>${f.componentId}</td><td>${f.status}</td><td>${formatClock(f.raisedAt)}</td><td>${f.workOrderId ?? '—'}</td></tr>`)
    .join('');
  const inv = checkInvariants(s);
  w.document.write(`<!doctype html><html><head><title>LineFlow report ${s.batch.id}</title><style>
    body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17212F;margin:32px;max-width:860px}
    h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px}.muted{color:#647185}
    table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #E6EBF1;padding:6px 8px;text-align:left}th{color:#647185;font-weight:500}
    .badge{display:inline-block;border:1px solid #D0D9E4;border-radius:999px;padding:1px 8px;font-size:11px}
  </style></head><body>
  <span class="badge">Simulation / Demo data</span>
  <h1>Batch ${s.batch.id} — ${s.batch.skuName}</h1>
  <div class="muted">Run ${s.runId} · scenario ${s.scenarioId} · seed ${s.seed} · ${formatClock(s.t)} virtual · engine ${ENGINE_VERSION}</div>
  <h2>Reconciliation</h2><table>
  <tr><td>Planned inbound slots</td><td>${c.planned.toLocaleString()}</td></tr>
  <tr><td>Not yet released</td><td>${c.unreleased.toLocaleString()}</td></tr>
  <tr><td>Released total</td><td>${c.released.toLocaleString()}</td></tr>
  <tr><td>&nbsp;&nbsp;Currently WIP</td><td>${c.wip.toLocaleString()}</td></tr>
  <tr><td>&nbsp;&nbsp;Rejected at QA</td><td>${c.rejected.toLocaleString()}</td></tr>
  <tr><td>&nbsp;&nbsp;Dispatched good</td><td>${c.dispatched.toLocaleString()}</td></tr>
  <tr><td>Committed sellable shipment</td><td>${s.batch.committedGood.toLocaleString()}</td></tr>
  <tr><td>Still required to ship</td><td>${k.remainingGood.toLocaleString()}</td></tr>
  <tr><td>Invariant check</td><td>${inv.length ? inv.join('; ') : 'All conservation checks pass'}</td></tr></table>
  <h2>KPIs</h2><table>
  <tr><td>OEE (packaging constraint)</td><td>${k.oee ? pct(k.oee.oee) : '—'}</td></tr>
  <tr><td>QA first-pass yield</td><td>${pct(k.yieldPct)} of ${k.inspected} inspected</td></tr>
  <tr><td>Throughput (rolling ${Math.round(k.throughputWindowSec / 60)} min)</td><td>${Math.round(k.throughputHr)} units/h</td></tr>
  <tr><td>Energy</td><td>${k.energyKWh.toFixed(2)} kWh${k.whPerGood ? ` · ${k.whPerGood.toFixed(1)} Wh per good unit` : ''}</td></tr>
  <tr><td>ETA</td><td>${k.eta.label} (${k.eta.basis})</td></tr></table>
  <h2>Stations</h2><table><tr><th>Station</th><th>Completed</th><th>Utilization</th><th>Downtime</th><th>Energy</th></tr>${stations}</table>
  <h2>Faults</h2>${faults ? `<table><tr><th>ID</th><th>Code</th><th>Component</th><th>Status</th><th>Raised</th><th>Work order</th></tr>${faults}</table>` : '<p class="muted">No faults in this run.</p>'}
  <p class="muted" style="margin-top:32px">Synthetic deterministic simulation. Not an empirical prediction of any real plant. Generated ${new Date().toISOString()}.</p>
  <script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}

const ImportSchema = z.object({
  schema: z.literal(SCHEMA),
  engineVersion: z.string(),
  session: z.object({
    engineVersion: z.string(),
    runId: z.string().max(40),
    seed: z.number(),
    t: z.number().nonnegative(),
    units: z.array(z.object({ id: z.string(), serial: z.string(), state: z.string() })).max(20000),
    events: z.array(z.object({ seq: z.number(), type: z.string(), virtualAt: z.number() })).max(400000),
    stations: z.record(z.string(), z.object({ inQ: z.array(z.string()), outQ: z.array(z.string()) })),
  }).passthrough(),
});

export async function importJson(file: File): Promise<{ ok: true; session: Session } | { ok: false; reason: string }> {
  if (file.size > 60 * 1024 * 1024) return { ok: false, reason: 'File is larger than 60 MB' };
  try {
    const parsed = ImportSchema.safeParse(JSON.parse(await file.text()));
    if (!parsed.success) return { ok: false, reason: 'Not a LineFlow export (schema mismatch)' };
    if (parsed.data.session.engineVersion !== ENGINE_VERSION) return { ok: false, reason: `Export is from ${parsed.data.session.engineVersion}; this app runs ${ENGINE_VERSION}` };
    const s = parsed.data.session as unknown as Session;
    const errors = checkInvariants(s);
    if (errors.length) return { ok: false, reason: `Export failed integrity checks: ${errors[0]}` };
    return { ok: true, session: s };
  } catch {
    return { ok: false, reason: 'File is not valid JSON' };
  }
}
