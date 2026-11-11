import { useLayoutEffect, useRef, type PointerEvent as RPE } from 'react';
import { measure } from '../app/perf';
import { focusStation } from '../camera/commands';
import { STATIONS } from '../domain/config';
import type { StationId } from '../domain/types';
import { Inspector } from '../features/Inspector';
import { IcoChevronLeft } from '../ui/Icons';
import { useSheet } from './useSheet';
import { INSPECTOR_PRESETS, INSPECTOR_WIDTHS, snapWidth, workspace } from './workspaceStore';

const step = (w: number, dir: 1 | -1) => {
  const i = INSPECTOR_PRESETS.indexOf(snapWidth(w) as (typeof INSPECTOR_PRESETS)[number]);
  return INSPECTOR_PRESETS[Math.min(INSPECTOR_PRESETS.length - 1, Math.max(0, i + dir))];
};

/** Right dock for the selected machine: a layout column on desktop, an overlay at 1180px and a bottom sheet at 820px. Drag the left edge to resize. */
export function InspectorDock({ id, width }: { id: StationId; width: number }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => measure('lf:inspector-open', 'lf:inspector:start'), []);
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    return () => {
      const a = document.activeElement;
      if ((!a || a === document.body || a.closest('.insp-dock')) && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  const down = (e: RPE<HTMLDivElement>) => {
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPE<HTMLDivElement>) => drag.current && workspace.setInspectorWidth(drag.current.w - (e.clientX - drag.current.x));
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    workspace.setInspectorWidth(snapWidth(workspace.get().inspectorWidth));
  };
  const sheet = useSheet(() => workspace.closeInspector());
  return (
    <aside className="insp-dock" style={{ width }} aria-label="Machine inspector" data-sheet-size={sheet.size}>
      <button className="sheet-grab" {...sheet.grab} />
      <div
        className="resize-x left"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
        aria-valuemin={INSPECTOR_WIDTHS.min}
        aria-valuemax={INSPECTOR_WIDTHS.max}
        aria-valuenow={width}
        title="Drag to resize · double-click to cycle 320 / 380 / 440"
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={() => workspace.setInspectorWidth(width >= INSPECTOR_WIDTHS.max ? INSPECTOR_WIDTHS.min : step(width, 1))}
        onKeyDown={(e) => {
          const next = e.key === 'ArrowLeft' ? step(width, 1) : e.key === 'ArrowRight' ? step(width, -1) : e.key === 'Home' ? INSPECTOR_WIDTHS.min : e.key === 'End' ? INSPECTOR_WIDTHS.max : null;
          if (next === null) return;
          e.preventDefault();
          workspace.setInspectorWidth(next);
        }}
      />
      <StationStepper id={id} />
      <Inspector id={id} />
    </aside>
  );
}

const SWIPE_PX = 48;

function goTo(id: StationId) {
  workspace.select(id, { inspector: true });
  focusStation(id);
}

/** Sheet-only stepper: walk the line machine by machine with arrows or a horizontal swipe, without closing the sheet. */
function StationStepper({ id }: { id: StationId }) {
  const i = STATIONS.findIndex((m) => m.id === id);
  const prev = STATIONS[i - 1];
  const next = STATIONS[i + 1];
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <nav
      className="insp-nav"
      aria-label="Step through machines"
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const s0 = start.current;
        start.current = null;
        if (!s0) return;
        const dx = e.clientX - s0.x;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(e.clientY - s0.y) * 1.5) return;
        const to = dx < 0 ? next : prev;
        if (to) goTo(to.id);
      }}
    >
      <button className="insp-step" disabled={!prev} onClick={() => prev && goTo(prev.id)} aria-label={prev ? `Previous machine: ${prev.name}` : 'No previous machine'}>
        <IcoChevronLeft />
        <span>{prev?.short ?? 'Start'}</span>
      </button>
      <span className="insp-dots" aria-live="polite">
        {STATIONS.map((m) => (
          <i key={m.id} className={m.id === id ? 'on' : ''} />
        ))}
        <span className="sr-only">
          Machine {i + 1} of {STATIONS.length}
        </span>
      </span>
      <button className="insp-step next" disabled={!next} onClick={() => next && goTo(next.id)} aria-label={next ? `Next machine: ${next.name}` : 'No next machine'}>
        <span>{next?.short ?? 'End'}</span>
        <IcoChevronLeft />
      </button>
    </nav>
  );
}
