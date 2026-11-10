import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FAULT_DEF, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { effectiveStatus, formatClock, unitCounts } from '../domain/kpis';
import { SPEEDS, STATION_IDS, type Session, type StationId } from '../domain/types';
import { IcoPause, IcoPlay, IcoReset, IcoSave } from '../ui/Icons';
import { Chip } from '../ui/Kit';
import { store, useUi } from './store';

type Alert = { key: string; tone: 'critical' | 'warning' | 'info'; title: string; detail: string; station: StationId | null; action?: { label: string; run: () => void } };

export function alertsOf(s: Session): Alert[] {
  const out: Alert[] = [];
  for (const f of s.faults.filter(isOpenFault)) {
    const def = FAULT_DEF[f.code];
    out.push({ key: f.id, tone: f.severity === 'critical' ? 'critical' : 'warning', title: `${STATION_META[f.station].short} · ${def.title}`, detail: `${f.code} · ${f.status} · ${def.effect}`, station: f.station });
  }
  for (const m of Object.values(s.materials))
    if (m.available <= m.reorderPoint && !s.faults.some((f) => isOpenFault(f) && FAULT_DEF[f.code].material === m.id))
      out.push({ key: `mat:${m.id}`, tone: 'warning', title: `${m.name} low`, detail: `${m.available.toLocaleString()} left, reorder point ${m.reorderPoint.toLocaleString()}`, station: m.station });
  if (s.awaitingPartialApproval)
    out.push({
      key: 'partial',
      tone: 'info',
      title: 'Partial case waiting',
      detail: `The final case holds ${s.cases.find((c) => c.id === s.openCaseId)?.unitIds.length ?? 0} kits`,
      station: 'dispatch',
      action: { label: 'Approve', run: () => store.command({ kind: 'CLOSE_PARTIAL_CASE' }) },
    });
  return out;
}

const WIP_STATES = new Set(['queue', 'processing', 'transfer', 'acceptedAwaitingPackaging', 'packed']);

export function TopBar() {
  const s = useUi();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const c = unitCounts(s);
  const running = STATION_IDS.filter((id) => effectiveStatus(s, id) === 'processing').length;
  const alerts = alertsOf(s);
  const critical = alerts.some((a) => a.tone === 'critical');

  useEffect(() => {
    if (!alertsOpen) return;
    const close = (e: PointerEvent) => !pop.current?.contains(e.target as Node) && setAlertsOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAlertsOpen(false);
    addEventListener('pointerdown', close);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', esc);
    };
  }, [alertsOpen]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

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
    input.current?.blur();
    nav('/production');
  };

  const openStation = (id: StationId | null) => {
    setAlertsOpen(false);
    nav(id ? `/production?station=${id}&details=1` : '/production');
  };

  const wipSerials = s.units.filter((u) => WIP_STATES.has(u.state)).slice(0, 12);

  return (
    <header className="topbar">
      <form className="search" onSubmit={find} role="search">
        <svg className="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input ref={input} type="text" list="lf-wip" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Follow a serial" aria-label="Find a unit by serial and follow it" />
        <kbd>/</kbd>
        <datalist id="lf-wip">
          {wipSerials.map((u) => (
            <option key={u.id} value={u.serial} />
          ))}
        </datalist>
      </form>
      <div className="chips">
        <Chip tone={s.status === 'running' ? 'dark' : 'soft'} pip live={s.status === 'running'} k="Line" n={{ ready: 'Ready', running: 'Running', paused: 'Paused', completed: 'Done', halted: 'Halted' }[s.status]} />
        <Chip k="Stations" n={`${running}/6`} title="Stations processing a unit right now" className="opt" />
        <Chip k="WIP" n={c.wip.toLocaleString()} title="Units released and not yet shipped or rejected" className="opt" />
        <div className="pop-wrap" ref={pop}>
          <Chip tone={critical ? 'red' : alerts.length ? 'yellow' : 'default'} pip={alerts.length > 0} live={critical} k="Alerts" n={alerts.length} onClick={() => setAlertsOpen((o) => !o)} aria-expanded={alertsOpen} aria-haspopup="dialog" />
          {alertsOpen && (
            <div className="pop" role="dialog" aria-label="Alerts">
              <div className="pop-h">
                <span>Alerts</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {alerts.length ? `${alerts.length} open` : 'All clear'}
                </span>
              </div>
              {alerts.length === 0 && <div className="empty">No open faults or low materials.</div>}
              {alerts.map((a) => (
                <div key={a.key} className={`alert-row ${a.tone}`}>
                  <span className="bar" />
                  <span>
                    <b>{a.title}</b>
                    <small>{a.detail}</small>
                  </span>
                  {a.action ? (
                    <button className="btn sm blue" onClick={a.action.run}>
                      {a.action.label}
                    </button>
                  ) : (
                    <button className="btn sm" onClick={() => openStation(a.station)}>
                      Open
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="tb-right">
        <div className="clock" data-test="clock" title="Virtual simulation time">
          <b>{formatClock(s.t)}</b>
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
          className={`play${s.status === 'running' ? '' : ' go'}`}
          disabled={s.status === 'completed' || s.status === 'halted'}
          onClick={() => store.command({ kind: s.status === 'ready' ? 'START' : s.status === 'running' ? 'PAUSE' : 'RESUME' })}
          aria-label={s.status === 'ready' ? 'Start' : s.status === 'running' ? 'Pause' : 'Resume'}
          title={s.status === 'ready' ? 'Start the batch' : s.status === 'running' ? 'Pause' : 'Resume'}
        >
          {s.status === 'running' ? <IcoPause /> : <IcoPlay />}
        </button>
        <button className="icon-btn wide" onClick={() => store.fastForward(15 * 60)} disabled={s.status === 'completed'} title="Deterministically advance 15 virtual minutes, then pause">
          +15 min
        </button>
        <button className="icon-btn" onClick={() => void store.save()} title="Save snapshot to this browser" aria-label="Save snapshot">
          <IcoSave />
        </button>
        <button className="icon-btn" onClick={() => setConfirmReset(true)} title="Restart run" aria-label="Restart run">
          <IcoReset />
        </button>
      </div>
      {confirmReset && (
        <div className="modal-bg" role="dialog" aria-modal aria-label="Restart run">
          <div className="modal">
            <h2>Restart this run?</h2>
            <p className="muted" style={{ margin: 0 }}>
              Restores batch {s.batch.id} to its initial seed and settings and discards this run's events. Export first if you want to keep them.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  store.reset({ seed: s.seed });
                  setConfirmReset(false);
                }}
              >
                Restart run
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
