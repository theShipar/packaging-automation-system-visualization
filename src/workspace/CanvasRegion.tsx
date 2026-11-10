import { useLayoutEffect, useRef, useState } from 'react';
import { store, useUi } from '../app/store';
import { focusComponent, focusSelection } from '../camera/commands';
import { camera, useCamera } from '../camera/controller';
import { FAULT_DEF, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { formatClock } from '../domain/kpis';
import type { Session } from '../domain/types';
import { nextUnitAt } from '../features/follow-product/FollowCard';
import { IcoFit, IcoFocus, IcoFollow, IcoMinus, IcoPlus } from '../ui/Icons';
import { Scene } from '../vector/Scene';
import { ModeBar, ModePanel } from './ModeBar';
import { StatusRail } from './StatusRail';
import { useWorkspace, workspace } from './workspaceStore';

const NOISE = new Set(['STATION_CYCLE_STARTED', 'STATION_CYCLE_COMPLETED', 'UNIT_RELEASED', 'MATERIAL_CONSUMED', 'QA_INSPECTION_PASSED', 'CASE_OPENED', 'TRANSFER_RESERVED', 'TRANSFER_STARTED', 'TRANSFER_COMPLETED']);
/** Height kept clear for the notice row at the top of the canvas. */
const TOP_RESERVE = 56;

/** The canvas owns the remaining space; overlays float over it and the camera frames around them. */
export function CanvasRegion() {
  const w = useWorkspace();
  const s = useUi();
  const ref = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current, bot = bottom.current;
    if (!el || !bot) return;
    const measure = () => {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const inset = W < 700 ? 12 : 20;
      const floor = Math.min(H, bot.offsetTop) - 8;
      const left = panel ? panel.offsetLeft + panel.offsetWidth + 12 : inset;
      camera.setSafe({ x: left, y: TOP_RESERVE, w: W - left - inset, h: floor - TOP_RESERVE });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(bot);
    if (panel) ro.observe(panel);
    measure();
    return () => ro.disconnect();
  }, [panel]);

  return (
    <main ref={ref} className="ws-canvas" aria-label="Production canvas">
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
      <button className="icon-btn" onClick={() => camera.zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out ( − )">
        <IcoMinus />
      </button>
      <button className="zoom-pct num" onClick={() => camera.fit()} title="Zoom relative to Fit. Click to Fit the whole line">
        {Math.round(cam.zoomRatio() * 100)}%
      </button>
      <button className="icon-btn" onClick={() => camera.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in ( + )">
        <IcoPlus />
      </button>
      <span className="ct-sep" aria-hidden />
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
