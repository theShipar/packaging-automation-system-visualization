import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { store, useUi } from '../app/store';
import type { StationId } from '../domain/types';
import { useReducedMotionSync } from '../vector/Scene';
import { CanvasRegion } from './CanvasRegion';
import { InspectorDock } from './InspectorDock';
import { ShortcutsDialog } from './ShortcutsDialog';
import { ToolDrawer } from './ToolDrawer';
import { TopCommandBar } from './TopCommandBar';
import { WorkspaceRail } from './WorkspaceRail';
import { useWorkspace, workspace } from './workspaceStore';

const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

/** Selection, tool and item mirror the URL both ways so every state is a deep link. */
function useUrlSync() {
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => workspace.fromUrl(new URLSearchParams(loc.search)), [loc.search]);
  useEffect(() => {
    const off = workspace.subscribe(() => {
      const next = workspace.toUrl(new URLSearchParams(location.search));
      if (next !== location.search) nav({ pathname: '/production', search: next }, { replace: true });
    });
    return () => void off();
  }, [nav]);
}

export function AppShell() {
  useReducedMotionSync();
  useUrlSync();
  useUi();
  const w = useWorkspace();
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || typing(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
        return;
      }
      if (e.key !== 'Escape') return;
      if (workspace.back()) return;
      if (store.follow) return store.setFollow(null);
      if (workspace.get().tool) workspace.openTool(null);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { lfWorkspace: unknown }).lfWorkspace = {
      state: () => workspace.get(),
      select: (id: StationId | null) => workspace.select(id, { inspector: false }),
      selectComponent: (id: StationId, comp: string) => workspace.selectComponent(id, comp),
      openInspector: (id: StationId) => workspace.select(id, { inspector: true }),
      focus: (id: StationId) => workspace.select(id, { inspector: false }),
      openTool: workspace.openTool.bind(workspace),
    };
  }, []);

  return (
    <div className="shell">
      <TopCommandBar onHelp={() => setHelp(true)} />
      <div className="ws-row">
        <WorkspaceRail />
        {w.tool && <ToolDrawer tool={w.tool} item={w.item} width={w.drawerWidth} />}
        <CanvasRegion />
        {w.inspectorOpen && w.station && <InspectorDock id={w.station} width={w.inspectorWidth} />}
      </div>
      <div className="toasts" aria-live="polite">
        {store.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
    </div>
  );
}
