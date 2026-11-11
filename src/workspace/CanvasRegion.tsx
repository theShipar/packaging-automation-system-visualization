import { useLayoutEffect, useRef, useState } from 'react';
import { store, useUi } from '../app/store';
import { focusComponent, focusSelection, focusStation } from '../camera/commands';
import { camera, useCamera } from '../camera/controller';
import { FAULT_DEF, STATIONS, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { formatClock, stationView } from '../domain/kpis';
import type { Session } from '../domain/types';
import { nextUnitAt } from '../features/follow-product/FollowCard';
import { statusLabel } from '../ui/Status';
import { IcoFit, IcoFocus, IcoFollow, IcoMinus, IcoPlus } from '../ui/Icons';
import { Scene } from '../vector/Scene';
import { TourCard } from '../demo/TourCard';
import { TourPrompt } from '../demo/TourPrompt';
import { useDemo } from '../demo/demo';
import { ModeBar, ModePanel } from './ModeBar';
import { StatusRail } from './StatusRail';
import { useWorkspace, workspace } from './workspaceStore';

const NOISE = new Set(['STATION_CYCLE_STARTED', 'STATION_CYCLE_COMPLETED', 'UNIT_RELEASED', 'MATERIAL_CONSUMED', 'QA_INSPECTION_PASSED', 'CASE_OPENED', 'TRANSFER_RESERVED', 'TRANSFER_STARTED', 'TRANSFER_COMPLETED']);
/** Height kept clear for the notice row at the top of the canvas. */
const TOP_RESERVE = 56;
const MIN_SAFE_H = 120;
/** Panels that float over the canvas at narrow widths instead of taking a layout column. */
const overlays = () =>
  [...document.querySelectorAll<HTMLElement>('.insp-dock, .tool-drawer, .m-sheet')].filter((o) => {
    const p = getComputedStyle(o).position;
    return p === 'absolute' || p === 'fixed';
  });
/** Resting box of a panel: sheets slide in with a transform, which must not shift the frame. */
const restingRect = (o: HTMLElement) => {
  const r = o.getBoundingClientRect();
  const tf = getComputedStyle(o).transform;
  const m = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf) : null;
  const dx = m?.m41 ?? 0, dy = m?.m42 ?? 0;
  return { top: r.top - dy, left: r.left - dx, right: r.right - dx, width: r.width };
};
/** Fired by panels the canvas cannot observe through workspace state (phone sheets). */
export const OVERLAYS_CHANGED = 'lf:overlays';

/** The canvas owns the remaining space; overlays float over it and the camera frames around them. */
export function CanvasRegion() {
  const w = useWorkspace();
  const s = useUi();
  const ref = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const touring = useDemo().step !== null;

  useLayoutEffect(() => {
    const el = ref.current, bot = bottom.current;
    if (!el || !bot) return;
    const measure = () => {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const inset = W < 700 ? 12 : 20;
      const box = el.getBoundingClientRect();
      let left = inset, right = W - inset, padR = 0, padB = 0;
      for (const o of overlays()) {
        const r = restingRect(o);
        if (r.width >= box.width * 0.6) {
          if (r.top - box.top > TOP_RESERVE + MIN_SAFE_H) padB = Math.max(padB, box.bottom - r.top);
        }
        else if (r.left > box.left + box.width / 2) padR = Math.max(padR, box.right - r.left);
        else left = Math.max(left, r.right - box.left + 12);
      }
      // overlay controls step aside from floating panels; read layout only after they move
      el.style.setProperty('--ov-r', `${Math.round(padR)}px`);
      el.style.setProperty('--ov-b', `${Math.round(padB)}px`);
      el.toggleAttribute('data-sheet', padB > 0);
      const tour = el.querySelector<HTMLElement>('.tour-card');
      const tourH = tour ? tour.offsetHeight + 8 : 0;
      el.style.setProperty('--tour-h', `${tourH}px`);
      const top = TOP_RESERVE + tourH;
      right -= padR;
      let floor = Math.min(H, bot.offsetTop) - 8;
      if (panel) {
        if (panel.offsetWidth >= W * 0.6) {
          if (panel.offsetTop - 8 > top + MIN_SAFE_H) floor = Math.min(floor, panel.offsetTop - 8);
        } else left = Math.max(left, panel.offsetLeft + panel.offsetWidth + 12);
      }
      camera.setSafe({ x: left, y: top, w: Math.max(MIN_SAFE_H, right - left), h: Math.max(MIN_SAFE_H / 2, floor - top) });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(bot);
    if (panel) ro.observe(panel);
    overlays().forEach((o) => ro.observe(o));
    const tour = el.querySelector<HTMLElement>('.tour-card');
    if (tour) ro.observe(tour);
    const onOverlays = () => {
      overlays().forEach((o) => ro.observe(o));
      measure();
    };
    addEventListener(OVERLAYS_CHANGED, onOverlays);
    measure();
    return () => {
      ro.disconnect();
      removeEventListener(OVERLAYS_CHANGED, onOverlays);
    };
  }, [panel, w.inspectorOpen && w.station !== null, w.tool, touring]);

  return (
    <main ref={ref} className="ws-canvas" aria-label="Production canvas">
      <StationNav s={s} />
      <TourCard />
      <TourPrompt />
      <Scene selected={w.station} selectedComp={w.comp} onSelect={(id) => workspace.select(id)} onSelectComp={(c, st) => {
          const id = st ?? w.station;
          if (id) workspace.selectComponent(id, c);
        }}
      />
      <div className="ov ov-top">
        <CriticalNotice s={s} />
        <LatestEvent s={s} />
      </div>
      {s.status === 'ready' && (
        <div className="ov ov-hint" role="note">
          Press <b>Start</b> to release the first {s.config.intake.feedReleaseSize} units.
        </div>
      )}
      <ModePanel s={s} panelRef={setPanel} />
      <div className="ov ov-bottom" ref={bottom}>
        <div className="ob-left">
          <ModeBar />
        </div>
        <StatusRail />
        <div className="ob-right">
          <CameraControls s={s} />
        </div>
      </div>
    </main>
  );
}

function CameraControls({ s }: { s: Session }) {
  const cam = useCamera();
  const w = useWorkspace();
  const following = store.follow !== null;
  const next = w.station ? nextUnitAt(s, w.station) : null;
  return (
    <div className="cam-tools" role="toolbar" aria-label="Camera">
      <button className="icon-btn zoom-btn" onClick={() => camera.zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out ( − )">
        <IcoMinus />
      </button>
      <button className="zoom-pct num" onClick={() => camera.fit()} title="Zoom relative to Fit. Click to Fit the whole line">
        {Math.round(cam.zoomRatio() * 100)}%
      </button>
      <button className="icon-btn zoom-btn" onClick={() => camera.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in ( + )">
        <IcoPlus />
      </button>
      <span className="ct-sep zoom-btn" aria-hidden />
      <button className={`icon-btn${cam.mode === 'overview' ? ' on' : ''}`} onClick={() => camera.fit()} aria-label="Fit whole line" title="Fit whole line ( F )">
        <IcoFit />
      </button>
      <button className={`icon-btn${cam.mode === 'focus-station' || cam.mode === 'focus-component' ? ' on' : ''}`} disabled={!w.station} onClick={focusSelection} aria-label="Focus selection" title={w.station ? `Focus ${w.comp ?? STATION_META[w.station].short}` : 'Select a machine to focus it'}>
        <IcoFocus />
      </button>
      <button
        className="icon-btn"
        aria-pressed={following}
        disabled={!following && !next}
        onClick={() => store.setFollow(following ? null : next)}
        aria-label={following ? 'Stop following' : 'Follow next unit'}
        title={following ? 'Stop following' : next ? `Follow the next unit at ${STATION_META[w.station!].short}` : w.station ? 'No unit at this machine right now' : 'Select a machine, or click a product, to follow it'}
      >
        <IcoFollow />
      </button>
    </div>
  );
}

function CriticalNotice({ s }: { s: Session }) {
  const f = s.faults.find((x) => isOpenFault(x) && x.severity === 'critical');
  if (!f) return null;
  return (
    <button
      className="notice crit"
      role="alert"
      onClick={() => {
        workspace.selectComponent(f.station, f.componentId);
        workspace.openInspector('overview');
        focusComponent(f.station, f.componentId);
      }}
    >
      <span className="pip" aria-hidden />
      <b>{STATION_META[f.station].short}</b> · {FAULT_DEF[f.code].title} <span className="mono">{f.code}</span>
      <span className="go">Inspect</span>
    </button>
  );
}

function LatestEvent({ s }: { s: Session }) {
  let e = null;
  for (let i = s.events.length - 1; i >= 0; i--)
    if (!NOISE.has(s.events[i].type)) {
      e = s.events[i];
      break;
    }
  if (!e) return null;
  const station = e.stationId;
  return (
    <button className="notice latest" onClick={() => (station ? workspace.select(station) : workspace.openTool('events'))} title={`${e.message} — the full log is in Events`}>
      <span className={`sev ${e.severity}`} aria-hidden />
      <span className="num muted">{formatClock(e.virtualAt)}</span>
      <span className="msg">{e.message}</span>
    </button>
  );
}

/** Keyboard path to the machines: a list that stays out of sight until it receives focus. */
function StationNav({ s }: { s: Session }) {
  const w = useWorkspace();
  const list = useRef<HTMLUListElement>(null);
  const move = (i: number) => (list.current?.querySelectorAll('button')[(i + STATIONS.length) % STATIONS.length] as HTMLElement | undefined)?.focus();
  return (
    <nav className="st-nav" aria-label="Machines">
      <span className="st-nav-h">Machines · ↑ ↓ to move · Enter to inspect · [ ] from anywhere</span>
      <ul ref={list}>
        {STATIONS.map((m, i) => {
          const v = stationView(s, m.id);
          const fault = s.faults.find((f) => f.station === m.id && isOpenFault(f));
          return (
            <li key={m.id}>
              <button
                aria-current={w.station === m.id ? 'true' : undefined}
                onClick={() => {
                  workspace.select(m.id, { inspector: true });
                  focusStation(m.id);
                }}
                onKeyDown={(e) => {
                  const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? STATIONS.length - 1 : null;
                  if (to === null) return;
                  e.preventDefault();
                  move(to);
                }}
              >
                <span className="num tert">{m.no}</span>
                <span>{m.name}</span>
                <span className={`st-nav-s s-${v.status}`}>{fault ? FAULT_DEF[fault.code].title : statusLabel(v.status)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
