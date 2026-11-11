import { useEffect, useRef, useState, type FormEvent } from 'react';
import { store, useUi } from '../app/store';
import { formatClock, lineKpis } from '../domain/kpis';
import { SPEEDS, type Session } from '../domain/types';
import { IcoBell, IcoFit, IcoKeyboard, IcoLab, IcoMore, IcoPause, IcoPlay, IcoReset, IcoSave, IcoSearch, IcoStep } from '../ui/Icons';
import { focusComponent, focusStation } from '../camera/commands';
import { alertsOf, type Alert } from './alerts';
import { RestartDialog, RestoreScenarioDialog } from './RestartDialog';
import { camera } from '../camera/controller';
import { usePopover } from './usePopover';
import { workspace } from './workspaceStore';
import { demo, useDemo } from '../demo/demo';

const WIP_STATES = new Set(['queue', 'processing', 'transfer', 'acceptedAwaitingPackaging', 'packed']);
const LINE_STATE: Record<Session['status'], string> = { ready: 'Ready', running: 'Running', paused: 'Paused', completed: 'Completed', halted: 'Halted' };

export function TopCommandBar({ onHelp }: { onHelp: () => void }) {
  const s = useUi();
  const k = lineKpis(s);
  const [dialog, setDialog] = useState<'restart' | 'restore' | null>(null);
  const faulted = s.faults.some((f) => f.kind === 'stop' && f.status !== 'recovered' && f.status !== 'resolved');
  const state = faulted && s.status === 'running' ? 'Faulted' : LINE_STATE[s.status];
  const pct = Math.min(1, k.shipped / Math.max(1, s.batch.committedGood));
  const presenting = useDemo().presenting;

  return (
    <header className="cmdbar" aria-label="Line command bar">
      <div className="cb-left">
        <span className="brand-mark" aria-hidden />
        <span className="cb-path">
          <span className="cb-crumb">LineFlow · Plant A /</span>
          <h1 className="cb-title">Line 01 · Packaging</h1>
        </span>
      </div>

      <div className="cb-mid">
        <button className="cb-batch" data-test="batch" onClick={() => workspace.openTool('batches', s.batch.id)} title={`Open batch ${s.batch.id}: ${s.batch.skuName}`}>
          <span className="k">Batch</span>
          <b className="num">{s.batch.id}</b>
          <span className="k cb-sku">{s.batch.sku}</span>
        </button>
        <span className="sim-pill" title="All data in LineFlow is synthetic. No real machines are connected or controlled.">
          Simulation
        </span>
        <span className={`state-pill st-${state.toLowerCase()}`} role="status" aria-live="polite">
          <i aria-hidden />
          {state}
        </span>
        <span className="cb-progress" title={`${k.shipped.toLocaleString()} good units shipped of ${s.batch.committedGood.toLocaleString()} committed`}>
          <span className="num">
            <b>{k.shipped.toLocaleString()}</b> / {s.batch.committedGood.toLocaleString()}
          </span>
          <span className="bar" role="progressbar" aria-label="Shipped against committed" aria-valuemin={0} aria-valuemax={s.batch.committedGood} aria-valuenow={k.shipped}>
            <i style={{ width: `${pct * 100}%` }} />
          </span>
        </span>
      </div>

      <div className="cb-right">
        <SerialSearch s={s} />
        <Alerts s={s} />
        <div className="clock" data-test="clock" title="Virtual simulation time (not wall clock)">
          <b className="num">{formatClock(s.t)}</b>
          <span>virtual time</span>
        </div>
        <div className="seg" data-test="speed" role="radiogroup" aria-label="Simulation speed">
          {SPEEDS.map((v) => (
            <button key={v} role="radio" aria-checked={s.speed === v} className={s.speed === v ? 'on' : ''} onClick={() => s.speed !== v && store.command({ kind: 'SET_SPEED', speed: v })}>
              {v}×
            </button>
          ))}
        </div>
        <button
          data-test="play"
          className={`play${s.status === 'running' ? ' on' : ''}`}
          disabled={s.status === 'completed' || s.status === 'halted'}
          onClick={() => store.command({ kind: s.status === 'ready' ? 'START' : s.status === 'running' ? 'PAUSE' : 'RESUME' })}
          aria-label={s.status === 'ready' ? 'Start batch' : s.status === 'running' ? 'Pause' : 'Resume'}
          title={s.status === 'completed' ? 'Batch completed — restart the run to play again' : s.status === 'ready' ? 'Start the batch' : s.status === 'running' ? 'Pause (virtual clock stops)' : 'Resume from the exact paused state'}
        >
          {s.status === 'running' ? <IcoPause /> : <IcoPlay />}
          <span>{s.status === 'ready' ? 'Start' : s.status === 'running' ? 'Pause' : 'Resume'}</span>
        </button>
        <button className="icon-btn save" onClick={() => void store.save()} title="Save snapshot of this run to the browser" aria-label="Save snapshot">
          <IcoSave />
        </button>
        {presenting && (
          <button className="btn sm present-exit" onClick={() => demo.setPresenting(false)} title="Leave presentation mode (Esc)">
            Exit presentation
          </button>
        )}
        <RunMenu s={s} onDialog={setDialog} onHelp={onHelp} />
      </div>
      {dialog === 'restart' && <RestartDialog onClose={() => setDialog(null)} />}
      {dialog === 'restore' && <RestoreScenarioDialog onClose={() => setDialog(null)} />}
    </header>
  );
}

function SerialSearch({ s }: { s: Session }) {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [setOpen]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  const find = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim().toLowerCase();
    if (!term) return;
    const hits = s.units.filter((u) => u.id.toLowerCase() === term || u.serial.toLowerCase() === term || u.serial.toLowerCase().endsWith(term));
    const u = hits.find((x) => WIP_STATES.has(x.state)) ?? hits[0];
    if (!u) return store.toast(`No unit matches “${q.trim()}”`, 'error');
    if (u.state === 'unreleased') return store.toast(`${u.serial} has not been released to the line yet`, 'info');
    if (u.state === 'dispatched' || u.state === 'rejected') return store.toast(`${u.serial} is ${u.state === 'dispatched' ? 'already shipped' : 'in the reject tray'}`, 'info');
    store.setFollow(u.id);
    setQ('');
    setOpen(false);
  };
  const wip = s.units.filter((u) => WIP_STATES.has(u.state)).slice(0, 8);

  return (
    <div className="pop-wrap" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Find and follow a serial" title="Find and follow a serial ( / )">
        <IcoSearch />
      </button>
      {open && (
        <div className="pop pop-right search-pop" role="dialog" aria-label="Follow a serial">
          <form onSubmit={find} role="search" className="search">
            <IcoSearch />
            <input ref={input} type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serial, e.g. SN-0842-0120 or 0120" aria-label="Serial number" />
          </form>
          <div className="pop-sub">In work now</div>
          {wip.length === 0 && <div className="empty sm">No units on the line yet. Start the batch.</div>}
          {wip.map((u) => (
            <button
              key={u.id}
              className="menu-row"
              onClick={() => {
                store.setFollow(u.id);
                setOpen(false);
              }}
            >
              <span className="mono">{u.serial}</span>
              <span className="muted">{u.state === 'acceptedAwaitingPackaging' ? 'QA passed' : u.state}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Alerts({ s }: { s: Session }) {
  const { open, setOpen, ref } = usePopover();
  const alerts = alertsOf(s);
  const critical = alerts.some((a) => a.tone === 'critical');
  const go = (a: Alert) => {
    setOpen(false);
    if (!a.station) return;
    if (a.component) workspace.selectComponent(a.station, a.component);
    else workspace.select(a.station, { inspector: true });
    workspace.openInspector(a.component ? 'parts' : 'overview');
    if (a.component) focusComponent(a.station, a.component);
    else focusStation(a.station);
  };
  return (
    <div className="pop-wrap" ref={ref}>
      <button className={`icon-btn alerts${critical ? ' crit' : alerts.length ? ' warn' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" aria-label={`Alerts: ${alerts.length} open`} title={alerts.length ? `${alerts.length} item${alerts.length > 1 ? 's' : ''} need attention` : 'No open alerts'}>
        <IcoBell />
        {alerts.length > 0 && <span className="count num">{alerts.length}</span>}
      </button>
      {open && (
        <div className="pop pop-right" role="dialog" aria-label="Alerts">
          <div className="pop-h">
            <span>Needs attention</span>
            <span className="muted">{alerts.length ? `${alerts.length} open` : 'All clear'}</span>
          </div>
          {alerts.length === 0 && <div className="empty sm">No open faults or low materials.</div>}
          {alerts.map((a) => (
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
                <button className="btn sm" onClick={() => go(a)}>
                  Inspect
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunMenu({ s, onDialog, onHelp }: { s: Session; onDialog: (d: 'restart' | 'restore') => void; onHelp: () => void }) {
  const { open, setOpen, ref } = usePopover();
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label="Run menu" title="Run menu">
        <IcoMore />
      </button>
      {open && (
        <div className="pop pop-right menu" role="menu">
          <button role="menuitem" className="menu-row narrow-only" onClick={pick(() => void store.save())}>
            <IcoSave />
            <span>
              Save snapshot
              <small>Keep this run in the browser</small>
            </span>
          </button>
          <button role="menuitem" className="menu-row" disabled={s.status === 'completed'} onClick={pick(() => store.fastForward(15 * 60))}>
            <IcoStep />
            <span>
              Advance 15 virtual minutes
              <small>Deterministic step of the same engine, then pause</small>
            </span>
          </button>
          <button role="menuitem" className="menu-row" onClick={pick(() => (store.setFollow(null), camera.fit()))}>
            <IcoFit />
            <span>
              Reset view
              <small>Fit the whole line; no run data changes</small>
            </span>
          </button>
          <button role="menuitem" className="menu-row" onClick={pick(() => onDialog('restore'))}>
            <IcoLab />
            <span>
              Restore scenario…
              <small>Reload the scenario from its start; asks first</small>
            </span>
          </button>
          <button role="menuitem" className="menu-row" onClick={pick(() => onDialog('restart'))}>
            <IcoReset />
            <span>
              Restart run…
              <small>Same seed, current settings; asks first</small>
            </span>
          </button>
          <button role="menuitem" className="menu-row" onClick={pick(() => demo.intro())}>
            <IcoPlay />
            <span>
              Guided demo
              <small>Five short scenes on a fixed seed; also at ?demo=1</small>
            </span>
          </button>
          <button role="menuitem" className="menu-row wide-only" onClick={pick(() => demo.setPresenting(!demo.get().presenting))}>
            <IcoFit />
            <span>
              {demo.get().presenting ? 'Leave presentation' : 'Presentation mode'}
              <small>Hide secondary chrome; P toggles, Esc leaves</small>
            </span>
          </button>
          <button role="menuitem" className="menu-row keys-only" onClick={pick(onHelp)}>
            <IcoKeyboard />
            <span>
              Keyboard shortcuts
              <small>Press ? anywhere</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
