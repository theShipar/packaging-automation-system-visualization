import { useRef, type PointerEvent as RPE } from 'react';
import { AnalyticsPage } from '../pages/Analytics';
import { AssetDetailPage, AssetsPage } from '../pages/Assets';
import { BatchDetailPage, BatchesPage } from '../pages/Batches';
import { EventsPage } from '../pages/Events';
import { MaintenancePage } from '../pages/Maintenance';
import { QualityPage } from '../pages/Quality';
import { ReportsPage } from '../pages/Reports';
import { SettingsPage } from '../pages/Settings';
import { ScenarioRunPage, SimulationPage } from '../pages/Simulation';
import { IcoClose } from '../ui/Icons';
import { DrawerTitle } from './drawerContext';
import { useSheet } from './useSheet';
import { toolLabel } from './WorkspaceRail';
import { workspace, type Tool } from './workspaceStore';


function body(tool: Tool, item: string | null) {
  switch (tool) {
    case 'batches':
      return item ? <BatchDetailPage id={item} /> : <BatchesPage />;
    case 'scenarios':
      return item ? <ScenarioRunPage id={item} /> : <SimulationPage />;
    case 'assets':
      return item ? <AssetDetailPage id={item} /> : <AssetsPage />;
    case 'analytics':
      return <AnalyticsPage />;
    case 'events':
      return <EventsPage />;
    case 'maintenance':
      return <MaintenancePage />;
    case 'quality':
      return <QualityPage />;
    case 'reports':
      return <ReportsPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

/** Docked tool drawer: part of the layout row, so the canvas shrinks instead of being covered. */
export function ToolDrawer({ tool, item, width }: { tool: Tool; item: string | null; width: number }) {
  const label = toolLabel(tool);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const down = (e: RPE<HTMLDivElement>) => {
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPE<HTMLDivElement>) => drag.current && workspace.setDrawerWidth(drag.current.w + e.clientX - drag.current.x);
  const up = () => (drag.current = null);
  const sheet = useSheet(() => workspace.openTool(null), 'full');
  return (
    <section className="tool-drawer" style={{ width }} aria-label={label} data-sheet-size={sheet.size}>
      <button className="sheet-grab" {...sheet.grab} />
      <header className="td-head">
        <h2>{label}</h2>
        <span className="sim-pill sm">Simulated data</span>
        <span className="spacer" />
        <button className="icon-btn sm" onClick={() => workspace.openTool(null)} aria-label={`Close ${label}`} title="Close (Esc)">
          <IcoClose />
        </button>
      </header>
      <div className="td-body" key={`${tool}:${item ?? ''}`}>
        <DrawerTitle.Provider value={label}>{body(tool, item)}</DrawerTitle.Provider>
      </div>
      <div
        className="resize-x right"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize drawer"
        aria-valuemin={320}
        aria-valuemax={760}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') workspace.setDrawerWidth(width - 24);
          if (e.key === 'ArrowRight') workspace.setDrawerWidth(width + 24);
        }}
      />
    </section>
  );
}
