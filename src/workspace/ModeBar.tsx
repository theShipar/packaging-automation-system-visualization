import { useState, type Ref } from 'react';
import { experiment, useExperiment, type Comparison } from '../app/experiment';
import { store } from '../app/store';
import { focusComponent, focusStation } from '../camera/commands';
import { camera } from '../camera/controller';
import { FAULTS, FAULT_DEF, PERMISSIONS, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { formatClock, formatDuration, lineKpis, stationView } from '../domain/kpis';
import type { FaultCode, Session } from '../domain/types';
import { FaultCard } from '../features/Inspector';
import { IcoClose, IcoLayers, IcoReset } from '../ui/Icons';
import { Select } from '../ui/Select';
import { alertsOf, type Alert } from './alerts';
import { ConfirmDialog, RestartDialog, RestoreScenarioDialog } from './RestartDialog';
import { usePopover } from './usePopover';
import { useSheet } from './useSheet';
import { MODES, useWorkspace, workspace, type Layer, type Mode } from './workspaceStore';

export const MODE_META: Record<Mode, { label: string; hint: string }> = {
  explore: { label: 'Explore', hint: 'Navigate, inspect and follow' },
  operate: { label: 'Operate', hint: 'Run the batch: step time, watch the constraint, restart' },
  diagnose: { label: 'Diagnose', hint: 'Open faults, their impact and simulated recovery' },
  experiment: { label: 'Experiment', hint: 'Baseline, change one thing, compare' },
};

export const LAYER_META: Record<Layer, { label: string; source: string }> = {
  flow: { label: 'Flow', source: 'Product direction, moving kits and queue overflow. Every frame.' },
  capacity: { label: 'Capacity', source: 'Input and output buffer fill per machine, from the engine queues. Updates live.' },
  health: { label: 'Health', source: 'Uptime this run and open faults per machine, from time-in-state.' },
  quality: { label: 'Quality', source: 'QA yield of inspected kits, rejects and the top defect code this run.' },
  energy: { label: 'Energy (simulated)', source: 'Modelled kWh per machine (power per state × virtual time). Not a meter.' },
};
const LAYERS = Object.keys(LAYER_META) as Layer[];

/** Modes are behaviour filters: they change the panel and the default layer, never the route, camera or run. */
export function enterMode(m: Mode) {
  const w = workspace.get();
  workspace.setMode(m);
  if (w.layer === 'flow' && m === 'diagnose') workspace.setLayer('health');
  if (w.layer === 'flow' && m === 'operate') workspace.setLayer('capacity');
}

/** Bottom-left: mode switch plus the one active data layer. */
export function ModeBar() {
  const w = useWorkspace();
  return (
    <div className="mode-bar" role="group" aria-label="Workspace mode and layer">
      <div className="seg mode-seg" role="radiogroup" aria-label="Mode">
        {MODES.map((m, i) => (
          <button
            key={m}
            role="radio"
            aria-checked={w.mode === m}
            tabIndex={w.mode === m ? 0 : -1}
            className={w.mode === m ? 'on' : ''}
            title={MODE_META[m].hint}
            onClick={() => enterMode(m)}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const next = MODES[(i + d + MODES.length) % MODES.length];
              enterMode(next);
              (e.currentTarget.parentElement?.children[MODES.indexOf(next)] as HTMLElement | undefined)?.focus();
            }}
          >
            {MODE_META[m].label}
          </button>
        ))}
      </div>
      <ModeMenu mode={w.mode} />
      <span className="ct-sep" aria-hidden />
      <LayerPicker layer={w.layer} />
      <span className="ct-sep" aria-hidden />
      <RestoreButton />
    </div>
  );
}

export function RestoreButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="restore-btn" aria-label="Restore scenario" title="Reload the scenario from its start. Asks first." onClick={() => setOpen(true)}>
        <IcoReset />
        <span>Restore scenario</span>
      </button>
      {open && <RestoreScenarioDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** Compact stand-in for the segmented switch when the canvas is narrow. */
function ModeMenu({ mode }: { mode: Mode }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="pop-wrap mode-menu" ref={ref}>
      <button className="btn sm ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="Change mode">
        {MODE_META[mode].label} ▾
      </button>
      {open && (
        <div className="pop pop-up menu" role="menu">
          {MODES.map((m) => (
            <button key={m} role="menuitemradio" aria-checked={m === mode} className="menu-row" onClick={() => (enterMode(m), setOpen(false))}>
              <span>
                {MODE_META[m].label}
                <small>{MODE_META[m].hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LayerPicker({ layer }: { layer: Layer }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="pop-wrap" ref={ref}>
      <button className={`layer-btn${layer !== 'flow' ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} title={`Data layer: ${LAYER_META[layer].label}`}>
        <IcoLayers />
        <span>{LAYER_META[layer].label}</span>
      </button>
      {open && (
        <div className="pop pop-up layer-pop" role="dialog" aria-label="Data layer">
          <div className="pop-h">
            <span>Data layer</span>
            <span className="muted">One at a time; products always move</span>
          </div>
          <div role="radiogroup" aria-label="Data layer">
            {LAYERS.map((l) => (
              <button key={l} role="radio" aria-checked={l === layer} className={`menu-row layer-row${l === layer ? ' on' : ''}`} onClick={() => (workspace.setLayer(l), setOpen(false))}>
                <span className="radio" aria-hidden />
                <span>
                  {LAYER_META[l].label}
                  <small>{LAYER_META[l].source}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

/** The mode's tools, docked at the canvas's left edge; the camera keeps the scene clear of it. */
export function ModePanel({ s, panelRef }: { s: Session; panelRef: Ref<HTMLElement> }) {
  const w = useWorkspace();
  if (w.mode === 'explore') return null;
  return <ModePanelBody s={s} panelRef={panelRef} mode={w.mode} />;
}

function ModePanelBody({ s, panelRef, mode }: { s: Session; panelRef: Ref<HTMLElement>; mode: Mode }) {
  const sheet = useSheet(() => enterMode('explore'));
  return (
    <section ref={panelRef} className="mode-panel" aria-label={`${MODE_META[mode].label} tools`} data-sheet-size={sheet.size}>
      <button className="sheet-grab" {...sheet.grab} />
      <div className="mp-head">
        <div>
          <span className="eyebrow">Mode</span>
          <h2>{MODE_META[mode].label}</h2>
        </div>
        <button className="icon-btn sm" onClick={() => enterMode('explore')} aria-label="Close panel and return to Explore" title="Back to Explore (selection and camera stay)">
          <IcoClose />
        </button>
      </div>
      {mode === 'operate' && <OperatePanel s={s} />}
      {mode === 'diagnose' && <DiagnosePanel s={s} />}
      {mode === 'experiment' && <ExperimentPanel s={s} />}
    </section>
  );
}

function OperatePanel({ s }: { s: Session }) {
  const k = lineKpis(s);
  const [dialog, setDialog] = useState<'restart' | 'restore' | null>(null);
  const b = s.t >= 120 ? k.bottleneck : null;
  const bv = b ? stationView(s, b) : null;
  const done = s.status === 'completed';
  return (
    <>
      <p className="mp-note">Play, pause and speed stay in the top bar in every mode.</p>
      <div className="mp-stats">
        <div>
          <span className="k">Shipped rate</span>
          <b className="num">{k.throughputWindowSec >= 60 ? `${Math.round(k.throughputHr)}/h` : '—'}</b>
          <small>{k.throughputWindowSec >= 60 ? `rolling ${Math.round(k.throughputWindowSec / 60)} min` : 'needs 1 min of run'}</small>
        </div>
        <div>
          <span className="k">ETA</span>
          <b>{k.eta.label}</b>
          <small title={k.eta.basis}>{k.eta.basis}</small>
        </div>
      </div>
      {b && bv && (
        <button
          className="mp-insight"
          onClick={() => {
            workspace.select(b, { inspector: true });
            focusStation(b);
          }}
          title="Slowest of the busiest stations — the measured constraint"
        >
          <span className="k">Constraint</span>
          <b>{STATION_META[b].name}</b>
          <span className="num muted">
            {(bv.avgCycle ?? s.config[b].cycleSeconds).toFixed(1)} s cycle{bv.utilization !== null ? ` · ${Math.round(bv.utilization * 100)}% busy` : ''}
          </span>
        </button>
      )}
      <div className="mp-actions">
        <button className="btn sm blue" disabled={done} title={done ? 'Batch completed — restart the run to continue' : 'Advance the same engine 15 virtual minutes, then pause'} onClick={() => store.fastForward(15 * 60)}>
          +15 min
        </button>
        <button className="btn sm" onClick={() => workspace.openTool('batches', s.batch.id)} title="Open the live batch and its reconciliation">
          Batch {s.batch.id}
        </button>
      </div>
      <div className="mp-sec">Reset, restore, restart</div>
      <button className="menu-row" onClick={() => (store.setFollow(null), camera.fit())}>
        <span>
          Reset view
          <small>Fit the whole line. No run data changes.</small>
        </span>
      </button>
      <button className="menu-row" onClick={() => setDialog('restore')}>
        <span>
          Restore scenario…
          <small>Reload the scenario from its start. Asks first.</small>
        </span>
      </button>
      <button className="menu-row" onClick={() => setDialog('restart')}>
        <span>
          Restart run…
          <small>Same seed, current settings. Asks first.</small>
        </span>
      </button>
      {dialog === 'restart' && <RestartDialog onClose={() => setDialog(null)} />}
      {dialog === 'restore' && <RestoreScenarioDialog onClose={() => setDialog(null)} />}
    </>
  );
}

const inspect = (a: Pick<Alert, 'station' | 'component'>) => {
  if (!a.station) return;
  if (a.component) workspace.selectComponent(a.station, a.component);
  else workspace.select(a.station, { inspector: true });
  workspace.openInspector(a.component ? 'parts' : 'overview');
  if (a.component) focusComponent(a.station, a.component);
  else focusStation(a.station);
};

function DiagnosePanel({ s }: { s: Session }) {
  const open = s.faults.filter(isOpenFault);
  const others = alertsOf(s).filter((a) => !open.some((f) => f.id === a.key));
  const past = s.faults.filter((f) => !isOpenFault(f)).slice(-3).reverse();
  return (
    <>
      {open.length === 0 && others.length === 0 && <p className="mp-note">All clear — no open faults or low materials. Healthy machines stay on the Health layer for context.</p>}
      {open.map((f) => (
        <div key={f.id} className="mp-fault">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{STATION_META[f.station].name}</b>
            <button className="btn sm ghost" onClick={() => inspect({ station: f.station, component: f.componentId })}>
              Inspect
            </button>
          </div>
          <FaultCard s={s} f={f} />
        </div>
      ))}
      {others.map((a) => (
        <div key={a.key} className={`alert-row ${a.tone}`}>
          <span className="bar" />
          <span>
            <b>{a.title}</b>
            <small>{a.detail}</small>
          </span>
          {a.action ? (
            <button className="btn sm primary" onClick={a.action.run}>
              {a.action.label}
            </button>
          ) : (
            <button className="btn sm" onClick={() => inspect(a)}>
              Inspect
            </button>
          )}
        </div>
      ))}
      {past.length > 0 && (
        <>
          <div className="mp-sec">Recovered this run</div>
          {past.map((f) => (
            <div key={f.id} className="log-row">
              <time className="tert num">{formatClock(f.raisedAt)}</time>
              <span>
                {FAULT_DEF[f.code].title} · {STATION_META[f.station].short}
                {f.resolvedAt !== null && <span className="tert"> · down {formatDuration(f.resolvedAt - f.raisedAt)}</span>}
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

const can = (kind: string) => PERMISSIONS[kind]?.includes(store.role) ?? false;

function ExperimentPanel({ s }: { s: Session }) {
  const x = useExperiment();
  const [code, setCode] = useState<FaultCode>('PKG_JAM');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const b = x.baseline;
  const blocked = x.blocked(s);
  const changes = x.changes(s);
  const stale = x.result && x.result.t !== s.t;
  return (
    <>
      {!b ? (
        <>
          <p className="mp-note">Capture a baseline, change one thing (inject a fault, edit a setting in the inspector's Config tab), run the line, then compare at the same virtual time.</p>
          <button className="btn sm blue" onClick={() => x.capture()}>
            Capture baseline at {formatClock(s.t)}
          </button>
        </>
      ) : (
        <div className="mp-base">
          <span className="k">Baseline</span>
          <b className="num">virtual {formatClock(b.t)}</b>
          <small>
            {b.runId} · seed {b.session.seed} · {changes.length ? `${changes.length} change${changes.length > 1 ? 's' : ''} since` : 'no changes yet'}
          </small>
          {changes.length > 0 && (
            <ul className="mp-changes">
              {changes.slice(-4).map((c, i) => (
                <li key={i}>
                  <span className="num tert">{formatClock(c.at)}</span> {describe(c.command)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mp-sec">Inject a fault</div>
      <div className="row">
        <Select value={code} onChange={setCode} aria-label="Fault to inject" style={{ flex: 1, minWidth: 0 }} options={FAULTS.map((f) => ({ value: f.code, label: `${STATION_META[f.station].short} · ${f.title}`, hint: f.code }))} />
        <button className="btn sm amber" disabled={!can('INJECT_FAULT') || s.status === 'completed'} title={!can('INJECT_FAULT') ? 'Your role cannot inject faults (Settings)' : s.status === 'completed' ? 'Batch completed' : 'Simulation only — injects a synthetic fault'} onClick={() => store.command({ kind: 'INJECT_FAULT', code })}>
          Inject
        </button>
      </div>
      {b && (
        <>
          <div className="mp-sec">Compare</div>
          <button className="btn sm blue" disabled={!!blocked} title={blocked ?? 'Replay the baseline headless to now and compare'} onClick={() => x.compare()}>
            {x.result && !stale ? 'Compared at ' + formatClock(x.result.t) : `Compare at ${formatClock(s.t)}`}
          </button>
          {blocked && <small className="tert">{blocked}</small>}
          {x.result && <CompareTable r={x.result} stale={!!stale} />}
          <div className="mp-actions">
            <button className="btn sm" onClick={() => setConfirmRestore(true)} title="Put the line back exactly as it was at the baseline">
              Restore baseline
            </button>
            <button className="btn sm" onClick={() => void store.save()} title="Save the current run (with results) to this browser">
              Keep as snapshot
            </button>
            <button className="btn sm ghost" onClick={() => x.discard()} title="Forget the baseline; the live run continues unchanged">
              Discard
            </button>
          </div>
        </>
      )}
      {confirmRestore && b && <RestoreBaseline onClose={() => setConfirmRestore(false)} t={b.t} />}
    </>
  );
}

function RestoreBaseline({ onClose, t }: { onClose: () => void; t: number }) {
  return (
    <ConfirmDialog title="Restore the baseline?" confirm="Restore baseline" offerCopy onClose={onClose} onConfirm={() => experiment.restore()}>
      Puts the line back exactly as it was at virtual {formatClock(t)}. Everything since — events, faults, setting changes — is discarded from the live run. The baseline itself is kept, so you can try another change.
    </ConfirmDialog>
  );
}

function describe(c: Session['commandLog'][number]['command']): string {
  switch (c.kind) {
    case 'INJECT_FAULT':
      return `Injected ${FAULT_DEF[c.code].title}`;
    case 'APPLY_SETTINGS':
      return `Changed ${STATION_META[c.stationId].short}: ${Object.entries(c.values).map(([k, v]) => `${k} ${v}`).join(', ')}`;
    case 'RECEIVE_MATERIAL':
      return `Received ${c.qty} ${c.material}`;
    default:
      return c.kind.toLowerCase().replace(/_/g, ' ');
  }
}

const ROWS: { key: 'shipped' | 'rejected' | 'downtimeSec' | 'avgWip' | 'energyKWh'; label: string; fmt: (v: number) => string; better: 1 | -1 }[] = [
  { key: 'shipped', label: 'Shipped', fmt: (v) => v.toLocaleString(), better: 1 },
  { key: 'rejected', label: 'Rejected', fmt: (v) => v.toLocaleString(), better: -1 },
  { key: 'downtimeSec', label: 'Downtime', fmt: (v) => formatDuration(v), better: -1 },
  { key: 'avgWip', label: 'Average WIP', fmt: (v) => v.toFixed(1), better: -1 },
  { key: 'energyKWh', label: 'Energy (sim.)', fmt: (v) => `${v.toFixed(1)} kWh`, better: -1 },
];

function CompareTable({ r, stale }: { r: Comparison; stale: boolean }) {
  return (
    <div className={`mp-compare${stale ? ' stale' : ''}`}>
      <table className="tbl compact">
        <thead>
          <tr>
            <th />
            <th className="r">Baseline</th>
            <th className="r">Live</th>
            <th className="r">Δ</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const a = r.base[row.key], v = r.live[row.key], d = v - a;
            const tone = Math.abs(d) < 1e-6 ? '' : d * row.better > 0 ? 'good' : 'bad';
            return (
              <tr key={row.key} data-metric={row.key}>
                <td>{row.label}</td>
                <td className="r num">{row.fmt(a)}</td>
                <td className="r num">{row.fmt(v)}</td>
                <td className={`r num delta ${tone}`}>{Math.abs(d) < 1e-6 ? '—' : `${d > 0 ? '+' : '−'}${row.key === 'downtimeSec' ? formatDuration(Math.abs(d)) : row.fmt(Math.abs(d))}`}</td>
              </tr>
            );
          })}
          <tr>
            <td>Constraint</td>
            <td className="r">{r.base.bottleneck ? STATION_META[r.base.bottleneck].short : '—'}</td>
            <td className="r">{r.live.bottleneck ? STATION_META[r.live.bottleneck].short : '—'}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <small className="tert">
        Both read at virtual {formatClock(r.t)}. The baseline is replayed headless from its snapshot with no later commands. Synthetic — not a prediction.{stale ? ' The live run has moved on; compare again to refresh.' : ''}
      </small>
    </div>
  );
}
