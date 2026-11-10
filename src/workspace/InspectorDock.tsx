import { useRef, type PointerEvent as RPE } from 'react';
import type { StationId } from '../domain/types';
import { Inspector } from '../features/Inspector';
import { INSPECTOR_PRESETS, INSPECTOR_WIDTHS, snapWidth, workspace } from './workspaceStore';

const step = (w: number, dir: 1 | -1) => {
  const i = INSPECTOR_PRESETS.indexOf(snapWidth(w) as (typeof INSPECTOR_PRESETS)[number]);
  return INSPECTOR_PRESETS[Math.min(INSPECTOR_PRESETS.length - 1, Math.max(0, i + dir))];
};

/** Right dock for the selected machine; a layout column, never an overlay. Drag the left edge to resize. */
export function InspectorDock({ id, width }: { id: StationId; width: number }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
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
  return (
    <aside className="insp-dock" style={{ width }} aria-label="Machine inspector">
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
      <Inspector id={id} />
    </aside>
  );
}
