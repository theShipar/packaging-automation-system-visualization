import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { store, useUi } from '../app/store';
import { COMPONENTS, FAULTS, FAULT_DEF, MATERIALS, PERMISSIONS, ROLE_LABEL, SETTINGS_SCHEMA, STATION_META } from '../domain/config';
import { isOpenFault, stagingUnits } from '../domain/engine';
import { formatClock, stationView } from '../domain/kpis';
import type { Fault, FaultCode, MaterialId, Session, StationConfig, StationId } from '../domain/types';
import { IcoClose } from '../ui/Icons';
import { nextUnitAt } from './follow-product/FollowCard';
import { StatusDot, StatusPill, statusLabel } from '../ui/Status';
import { StationThumb } from '../vector/StationThumb';

type Tab = 'overview' | 'components' | 'logs' | 'settings';
const TABS: Tab[] = ['overview', 'components', 'logs', 'settings'];
const lastTab: Partial<Record<StationId, Tab>> = {};

const can = (kind: string) => PERMISSIONS[kind]?.includes(store.role) ?? false;

export function Inspector({ id, comp, onComp, onClose }: { id: StationId; comp: string | null; onComp: (c: string | null) => void; onClose: () => void }) {
  const s = useUi();
  const [tab, setTab] = useState<Tab>(lastTab[id] ?? 'overview');
  useEffect(() => setTab(lastTab[id] ?? 'overview'), [id]);
  useEffect(() => {
    if (comp) choose('components');
  }, [comp]);
  const choose = (t: Tab) => {
    lastTab[id] = t;
    setTab(t);
  };
  const meta = STATION_META[id];
  const v = stationView(s, id);
  const open = s.faults.filter((f) => f.station === id && isOpenFault(f));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <aside className="drawer insp" aria-label={`Station details: ${meta.name}`}>
      <div className="insp-head">
        <div className="row">
          <span className="eyebrow">Station {meta.no}</span>
          <span className="spacer" />
          <StatusPill status={v.status} />
          <button className="icon-btn" onClick={onClose} aria-label="Close details">
            <IcoClose />
          </button>
        </div>
        <div className="insp-name">{meta.name}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {meta.role}
        </div>
        <div className="insp-thumb">
          <StationThumb id={id} hiComp={comp ?? open[0]?.componentId ?? null} focus />
        </div>
        <div className="insp-kpis">
          <Tile t="Throughput" v={v.throughputHr} unit="/h" />
          <Tile t="Avg cycle" v={v.avgCycle ? v.avgCycle.toFixed(2) : '—'} unit={v.avgCycle ? 's' : undefined} />
          <Tile t="Utilisation" v={v.utilization === null ? '—' : `${Math.round(v.utilization * 100)}%`} />
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Inspector sections">
        {TABS.map((t, i) => (
          <button
            key={t}
            role="tab"
            className="tab"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => choose(t)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') choose(TABS[(i + 1) % 4]);
              if (e.key === 'ArrowLeft') choose(TABS[(i + 3) % 4]);
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="insp-body" role="tabpanel">
        {tab === 'overview' && <Overview s={s} id={id} />}
        {tab === 'components' && <Components s={s} id={id} comp={comp} onComp={onComp} />}
        {tab === 'logs' && <Logs s={s} id={id} />}
        {tab === 'settings' && <Settings s={s} id={id} />}
      </div>
      <Footer s={s} id={id} />
    </aside>
  );
}

function Tile({ t, v, unit, n, sm, wide, warn }: { t: string; v: ReactNode; unit?: string; n?: ReactNode; sm?: boolean; wide?: boolean; warn?: boolean }) {
  return (
    <div className={`tile${wide ? ' wide' : ''}${warn ? ' warn' : ''}`}>
      <span className="tile-t" title={t}>
        {t}
      </span>
      <span className={`tile-v${sm ? ' sm' : ''}`}>
        {v}
        {unit && <span className="unit">{unit}</span>}
      </span>
      {n && <span className="tile-n">{n}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

function Overview({ s, id }: { s: Session; id: StationId }) {
  const v = stationView(s, id);
  const st = s.stations[id];
  const faults = s.faults.filter((f) => f.station === id).slice(-3).reverse();
  const total = Object.values(st.timeIn).reduce((a, b) => a + b, 0);
  const mats = MATERIALS.filter((m) => m.station === id);
  const next = nextUnitAt(s, id);
  return (
    <>
      {faults.filter(isOpenFault).map((f) => (
        <FaultCard key={f.id} s={s} f={f} />
      ))}
      {v.status === 'blocked' && v.blockReason && <div className="banner warn">Blocked: {v.blockReason}</div>}
      {v.status === 'starved' && <div className="banner info">Starved — waiting for input from upstream. This is not a fault.</div>}
      <div className="tile wide">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="tile-t">In the machine</span>
          {v.currentUnit && <span className="tile-n num">{Math.round((v.progress ?? 0) * 100)}%</span>}
        </div>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
          <span className="tile-v sm num">{v.currentUnit ?? 'Empty'}</span>
          {next && (
            <button className="btn sm" onClick={() => store.setFollow(store.follow === next ? null : next)}>
              {store.follow === next ? 'Stop following' : 'Follow next unit'}
            </button>
          )}
        </div>
        {v.currentUnit && (
          <div className="progress" style={{ marginTop: 6 }}>
            <i style={{ width: `${(v.progress ?? 0) * 100}%` }} />
          </div>
        )}
      </div>
      <div>
        <div className="sec-t">Buffers</div>
        <div className="tiles">
          <Tile t="Input queue" v={v.inQueue} unit={`/ ${v.inCap}`} n={v.incoming > 0 ? `${v.incoming} arriving` : undefined} warn={v.inQueue >= v.inCap} />
          <Tile t={id === 'dispatch' ? 'Staged in cases' : 'Output queue'} v={v.outQueue} unit={`/ ${v.outCap}`} warn={v.outQueue >= v.outCap} />
          <Tile t="Completed this run" v={v.completed.toLocaleString()} />
          <Tile t="Energy" v={v.energyKWh.toFixed(2)} unit="kWh" />
        </div>
      </div>
      <StationSpecific s={s} id={id} />
      {mats.length > 0 && (
        <div>
          <div className="sec-t">Materials</div>
          {mats.map((m) => (
            <MaterialRow key={m.id} s={s} id={m.id} />
          ))}
        </div>
      )}
      <div>
        <div className="sec-t">Time in state</div>
        {total < 1 ? (
          <span className="muted">No runtime yet</span>
        ) : (
          <>
            <div className="state-bar">
              {(['processing', 'starved', 'blocked', 'faulted', 'maintenance'] as const)
                .filter((k) => st.timeIn[k] > 0)
                .map((k) => (
                  <i key={k} className={k} style={{ width: `${(st.timeIn[k] / total) * 100}%` }} title={`${statusLabel(k)} ${Math.round(st.timeIn[k])} s`} />
                ))}
            </div>
            <div className="legend">
              {(['processing', 'starved', 'blocked', 'faulted', 'maintenance'] as const)
                .filter((k) => st.timeIn[k] > 0)
                .map((k) => (
                  <span key={k}>
                    <StatusDot status={k} /> {statusLabel(k)} {Math.round((st.timeIn[k] / total) * 100)}%
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
      {faults.filter((f) => !isOpenFault(f)).length > 0 && (
        <div>
          <div className="sec-t">Recent incidents</div>
          {faults
            .filter((f) => !isOpenFault(f))
            .map((f) => (
              <div key={f.id} className="log-row">
                <time className="tert num">{formatClock(f.raisedAt)}</time>
                <span>
                  {f.code} · {f.status} {f.workOrderId && <span className="tert">({f.workOrderId})</span>}
                </span>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

function StationSpecific({ s, id }: { s: Session; id: StationId }) {
  const rows: [string, string][] = [];
  if (id === 'intake') {
    const retries = s.units.filter((u) => u.scanAttempts > 1).length;
    rows.push(['Unreleased in batch', (s.units.length - s.releaseCursor).toLocaleString()], ['Released', s.releaseCursor.toLocaleString()], ['Line WIP / cap', `${s.lineWip} / ${s.config.intake.wipCap}`], ['Units needing rescans', String(retries)]);
  } else if (id === 'qa') {
    const insp = s.inspections;
    const rej = insp.filter((i) => i.result === 'reject').length;
    const last = insp[insp.length - 1];
    rows.push(['Rule set', s.qaRule.version], ['Weight band', `${s.qaRule.weightMin}–${s.qaRule.weightMax} g`], ['Visual score max', String(s.qaRule.visualMax)], ['Inspected', insp.length.toLocaleString()], ['Rejected', `${rej} (${insp.length ? ((rej / insp.length) * 100).toFixed(1) : '0'}%)`], ['Reject tray', String(s.rejectTray.length)]);
    if (last) rows.push(['Last measured', `${last.serial.slice(-4)} · ${last.weight} g · vis ${last.visualScore} · ${last.result}`]);
  } else if (id === 'packaging') {
    rows.push(['Packaged this run', s.stations.packaging.completed.toLocaleString()], ['Cartons consumed', s.materials.retailCarton.consumed.toLocaleString()], ['Reserved (in machine)', String(s.materials.retailCarton.reserved)]);
  } else if (id === 'dispatch') {
    const open = s.cases.find((c) => c.id === s.openCaseId);
    const sealed = s.cases.filter((c) => c.status === 'sealed').length;
    const shipped = s.shipments.reduce((a, x) => a + x.units, 0);
    rows.push(['Open case', open ? `${open.id} · ${open.unitIds.length}/12` : '—'], ['Sealed, awaiting gate', String(sealed)], ['Staged units', String(stagingUnits(s))], ['Pallets', String(s.pallets.length)], ['Shipments', String(s.shipments.length)], ['Units dispatched', shipped.toLocaleString()], ['Gate cadence', `${s.config.dispatch.dispatchCadenceSec} s${s.config.dispatch.autoDispatch ? '' : ' (auto off)'}`]);
  } else if (id === 'robot') {
    rows.push(['Pick cycles', s.stations.robot.completed.toLocaleString()], ['Transfer to QA', `${s.config.robot.transferSeconds} s`]);
  } else if (id === 'assembly') {
    const latent = s.units.filter((u) => u.latent && u.state !== 'unreleased').length;
    rows.push(['Kits assembled', s.stations.assembly.completed.toLocaleString()], ['Latent defects (sim, hidden from QA)', String(latent)]);
  }
  return (
    <div>
      <div className="sec-t">{STATION_META[id].short}</div>
      <div className="tiles">
        {rows.map(([k, v]) => (
          <Tile key={k} t={k} v={v} sm wide={v.length > 14} />
        ))}
      </div>
    </div>
  );
}

export function MaterialRow({ s, id }: { s: Session; id: MaterialId }) {
  const m = s.materials[id];
  const low = m.available <= m.reorderPoint;
  return (
    <div className="mat-row">
      <span style={{ minWidth: 0 }}>
        <b style={{ fontWeight: 650 }}>{m.name}</b> <span className="tert mono">{m.lotId}</span>
      </span>
      <span className="row">
        <span className={`num ${m.available === 0 ? 'tag crit' : low ? 'tag warn' : ''}`}>{m.available.toLocaleString()}</span>
        <button className="btn sm" disabled={!can('RECEIVE_MATERIAL')} title={can('RECEIVE_MATERIAL') ? 'Simulated receipt of 500 units' : 'Your role cannot receive material'} onClick={() => store.command({ kind: 'RECEIVE_MATERIAL', material: id, qty: 500 })}>
          Receive 500
        </button>
      </span>
    </div>
  );
}

const STEP_LABELS = ['Raised', 'Acknowledged', 'Work order', 'Repair', 'Resolved', 'Recovered'];

function FaultCard({ s, f }: { s: Session; f: Fault }) {
  const def = FAULT_DEF[f.code];
  const wo = s.workOrders.find((w) => w.id === f.workOrderId);
  const stage = f.status === 'recovered' ? 5 : f.status === 'resolved' ? 4 : f.status === 'repairInProgress' ? 3 : wo ? 2 : f.status === 'acknowledged' ? 1 : 0;
  const paused = s.status === 'paused';
  return (
    <div className={`fault-card ${f.severity === 'critical' ? '' : 'warning'}`} role="alert">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{def.title}</b>
        <span className={`tag ${f.severity === 'critical' ? 'crit' : 'warn'}`}>{f.severity}</span>
      </div>
      <div style={{ fontSize: 12 }}>
        <span className="mono">{f.code}</span> on <span className="mono">{f.componentId}</span> · raised {formatClock(f.raisedAt)}
        <br />
        {def.effect} Recovery: {def.recovery}
      </div>
      {f.kind !== 'material' && (
        <div className="steps">
          {STEP_LABELS.map((l, i) => (
            <span key={l} className={i < stage ? 'done' : i === stage ? 'now' : ''}>
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="row wrap">
        {f.status === 'active' && (
          <button className="btn sm" disabled={!can('ACK_FAULT')} onClick={() => store.command({ kind: 'ACK_FAULT', faultId: f.id })}>
            Acknowledge
          </button>
        )}
        {f.kind === 'material' && def.material && <span className="muted" style={{ fontSize: 12 }}>Receive {s.materials[def.material].name.toLowerCase()} below to clear.</span>}
        {f.kind !== 'material' && f.status === 'acknowledged' && !wo && (
          <button className="btn sm blue" disabled={!can('CREATE_WORK_ORDER')} onClick={() => store.command({ kind: 'CREATE_WORK_ORDER', faultId: f.id })}>
            Create work order
          </button>
        )}
        {wo && wo.status === 'open' && (
          <>
            {f.kind === 'stop' && !paused && (
              <button className="btn sm" onClick={() => store.command({ kind: 'PAUSE' })}>
                Pause line (safety step)
              </button>
            )}
            <button className="btn sm blue" disabled={!can('START_WORK_ORDER') || (f.kind === 'stop' && !paused)} title={f.kind === 'stop' && !paused ? 'Pause the line first — simulated safety step' : !can('START_WORK_ORDER') ? 'Technician role required' : ''} onClick={() => store.command({ kind: 'START_WORK_ORDER', workOrderId: wo.id })}>
              Start repair {wo.id}
            </button>
          </>
        )}
        {f.status === 'repairInProgress' && (
          <button className="btn sm blue" disabled={!can('RESOLVE_FAULT')} title={!can('RESOLVE_FAULT') ? 'Technician role required' : ''} onClick={() => store.command({ kind: 'RESOLVE_FAULT', faultId: f.id })}>
            {def.steps[1] ?? 'Resolve'} & verify
          </button>
        )}
      </div>
      {!can('START_WORK_ORDER') && f.kind !== 'material' && <span className="tert" style={{ fontSize: 11 }}>Signed in as {ROLE_LABEL[store.role]} — repairs need the technician role (Settings).</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ components */

function Components({ s, id, comp, onComp }: { s: Session; id: StationId; comp: string | null; onComp: (c: string | null) => void }) {
  const list = COMPONENTS.filter((c) => c.station === id);
  const st = s.stations[id];
  const hours = (st.timeIn.processing / 3600).toFixed(2);
  return (
    <>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Select a component to highlight it on the drawing. Hover parts on the canvas to identify them.
      </p>
      {list.map((c) => {
        const faults = s.faults.filter((f) => f.componentId === c.id);
        const openF = faults.find(isOpenFault);
        const blocked = st.blockReason && FAULTS.some((f) => f.componentId === c.id && f.kind === 'material' && openF?.code === f.code);
        const health = openF ? (openF.kind === 'material' || blocked ? 'attention' : 'fault') : 'good';
        return (
          <button key={c.id} className={`comp-row${comp === c.id ? ' on' : ''}`} onClick={() => onComp(comp === c.id ? null : c.id)} aria-pressed={comp === c.id}>
            <b style={{ fontWeight: 550 }}>{c.name}</b>
            <span className={`health ${health}`}>{health === 'good' ? 'Good' : health === 'attention' ? 'Attention' : 'Fault'}</span>
            <span className="mono">{c.id}</span>
            <span className="tert" style={{ fontSize: 11 }}>
              {c.kind}
            </span>
            {comp === c.id && (
              <span style={{ gridColumn: '1 / -1', fontSize: 12, marginTop: 4 }} className="muted">
                {c.note}. {st.completed.toLocaleString()} cycles · {hours} h running this run · {faults.length} incident{faults.length === 1 ? '' : 's'} this run.{' '}
                <Link to={`/assets/${c.id}`} onClick={(e) => e.stopPropagation()}>
                  Asset page →
                </Link>
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ logs */

function Logs({ s, id }: { s: Session; id: StationId }) {
  const [cycles, setCycles] = useState(false);
  const rows = [];
  for (let i = s.events.length - 1; i >= 0 && rows.length < 80; i--) {
    const e = s.events[i];
    if (e.stationId !== id) continue;
    if (!cycles && (e.type === 'STATION_CYCLE_STARTED' || e.type === 'STATION_CYCLE_COMPLETED' || e.type === 'UNIT_RELEASED' || e.type === 'MATERIAL_CONSUMED' || e.type.startsWith('TRANSFER_'))) continue;
    rows.push(e);
  }
  return (
    <>
      <label className="row" style={{ fontSize: 12 }}>
        <input type="checkbox" checked={cycles} onChange={(e) => setCycles(e.target.checked)} /> Show cycle and material events
      </label>
      {rows.length === 0 && <div className="empty">No events for this station yet.</div>}
      <div>
        {rows.map((e) => (
          <div key={e.id} className="log-row">
            <time className="tert num">{formatClock(e.virtualAt)}</time>
            <span>
              <span className={`sev ${e.severity}`} />
              <span className="mono tert">{e.type}</span> {e.message}
            </span>
          </div>
        ))}
      </div>
      <Link to={`/events?station=${id}`}>Open in event log →</Link>
    </>
  );
}

/* ------------------------------------------------------------------ settings */

function Settings({ s, id }: { s: Session; id: StationId }) {
  const schema = SETTINGS_SCHEMA[id];
  const cfg = s.config[id];
  const [draft, setDraft] = useState<Partial<Record<keyof StationConfig, number | boolean>>>({});
  useEffect(() => setDraft({}), [id, s.configVersion]);
  const dirty = Object.entries(draft).filter(([k, v]) => cfg[k as keyof StationConfig] !== v);
  const allowed = schema.some((f) => f.roles.includes(store.role));
  return (
    <>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Changes take effect only after Apply, from the next cycle. Each apply is recorded as a SETTINGS_APPLIED event (config v{s.configVersion}).
      </p>
      {!allowed && <div className="banner info">Signed in as {ROLE_LABEL[store.role]}: read-only. Switch role in Settings to edit.</div>}
      <div>
        {schema.map((f) => {
          const cur = cfg[f.key];
          const val = draft[f.key] ?? cur;
          const isDirty = draft[f.key] !== undefined && draft[f.key] !== cur;
          const editable = f.roles.includes(store.role);
          return (
            <div key={f.key} className={`field${isDirty ? ' dirty' : ''}`}>
              <div>
                <div style={{ fontWeight: 500 }}>
                  {f.label} {isDirty && <span className="tag blue">edited</span>}
                </div>
                <div className="cur">
                  current {String(cur)}
                  {f.unit && ` ${f.unit}`} · range {f.min}–{f.max}
                </div>
              </div>
              {f.kind === 'boolean' ? (
                <input type="checkbox" checked={Boolean(val)} disabled={!editable} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })} aria-label={f.label} />
              ) : (
                <input type="number" min={f.min} max={f.max} step={f.step} value={Number(val)} disabled={!editable} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value === '' ? cur : Number(e.target.value) })} aria-label={f.label} />
              )}
              <div className="hint">{f.impact}</div>
            </div>
          );
        })}
      </div>
      <div className="row">
        <button
          className="btn blue"
          disabled={!dirty.length || !allowed}
          onClick={() => {
            const r = store.command({ kind: 'APPLY_SETTINGS', stationId: id, values: Object.fromEntries(dirty) as Partial<StationConfig> });
            if (r.ok) store.toast(`Applied ${dirty.length} setting${dirty.length > 1 ? 's' : ''} to ${STATION_META[id].name}`, 'success');
          }}
        >
          Apply {dirty.length ? `(${dirty.length})` : ''}
        </button>
        <button className="btn" disabled={!dirty.length} onClick={() => setDraft({})}>
          Cancel
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ footer */

function Footer({ s, id }: { s: Session; id: StationId }) {
  const codes = FAULTS.filter((f) => f.station === id);
  const [code, setCode] = useState<FaultCode>(codes[0].code);
  useEffect(() => setCode(codes[0].code), [id]);
  return (
    <div className="insp-foot">
      <select value={code} onChange={(e) => setCode(e.target.value as FaultCode)} aria-label="Fault to simulate">
        {codes.map((f) => (
          <option key={f.code} value={f.code}>
            {f.code}
          </option>
        ))}
      </select>
      <button className="btn sm amber" disabled={!can('INJECT_FAULT') || s.status === 'completed'} onClick={() => store.command({ kind: 'INJECT_FAULT', code })} title="Simulation only — injects a synthetic fault">
        Simulate issue
      </button>
      <span className="tert" style={{ fontSize: 11 }}>
        Simulation only
      </span>
    </div>
  );
}
