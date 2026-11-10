import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { store, useUi } from '../app/store';
import { focusComponent, focusStation } from '../camera/commands';
import { camera } from '../camera/controller';
import { STATION_IDS, type StationId } from '../domain/types';
import { useReducedMotionSync } from '../vector/Scene';
import { CanvasRegion } from './CanvasRegion';
import { InspectorDock } from './InspectorDock';
import { ShortcutsDialog } from './ShortcutsDialog';
import { ToolDrawer } from './ToolDrawer';
import { TopCommandBar } from './TopCommandBar';
import { WorkspaceRail } from './WorkspaceRail';
import { enterMode } from './ModeBar';
import { demo, useDemo } from '../demo/demo';
import { useWorkspace, workspace, type Layer, type Mode } from './workspaceStore';

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
  const d = useDemo();
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('demo') === '1') demo.intro();
    if (p.get('present') === '1') demo.setPresenting(true);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || typing(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === '0') {
        e.preventDefault();
        return camera.fit();
      }
      if (mod || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') return camera.fit();
      if (e.key === '+' || e.key === '=') return camera.zoomBy(1.25);
      if (e.key === '-' || e.key === '_') return camera.zoomBy(1 / 1.25);
      if (e.key === 'p' || e.key === 'P') return demo.setPresenting(!demo.get().presenting);
      if (e.key === '[' || e.key === ']') {
        const cur = workspace.get().station;
        const i = cur ? STATION_IDS.indexOf(cur) : -1;
        const next = STATION_IDS[(i + (e.key === ']' ? 1 : -1) + STATION_IDS.length) % STATION_IDS.length];
        workspace.select(next);
        return focusStation(next);
      }
      if (e.key !== 'Escape') return;
      if (workspace.back()) return;
      if (store.follow) return store.setFollow(null);
      if (workspace.get().tool) return workspace.openTool(null);
      if (demo.get().presenting) demo.setPresenting(false);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { lfWorkspace: unknown }).lfWorkspace = {
      state: () => workspace.get(),
      select: (id: StationId | null) => workspace.select(id, { inspector: false }),
      selectComponent: (id: StationId, comp: string) => {
        workspace.selectComponent(id, comp);
        focusComponent(id, comp);
      },
      openInspector: (id: StationId) => workspace.select(id, { inspector: true }),
      focus: (id: StationId) => {
        workspace.select(id, { inspector: false });
        focusStation(id);
      },
      openTool: workspace.openTool.bind(workspace),
      mode: (m: Mode) => enterMode(m),
      layer: (l: Layer) => workspace.setLayer(l),
    };
    (window as unknown as { lfCamera: unknown }).lfCamera = camera;
    (window as unknown as { lfDemo: unknown }).lfDemo = demo;
  }, []);

  return (
    <div className={`shell${d.presenting ? ' presenting' : ''}`}>
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
