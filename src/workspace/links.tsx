import type { MouseEvent, ReactNode } from 'react';
import { focusComponent, focusStation } from '../camera/commands';
import type { StationId } from '../domain/types';
import { workspace, type InspectorTab, type Tool } from './workspaceStore';

const plain = (e: MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);

/** Opens a tool (and optional item) in the drawer; a real href keeps new-tab and copy-link working. */
export function ToolLink({ tool, item, className, children }: { tool: Tool; item?: string | null; className?: string; children: ReactNode }) {
  const q = new URLSearchParams({ tool, ...(item ? { item } : {}) });
  return (
    <a
      className={className}
      href={`/production?${q}`}
      onClick={(e) => {
        if (!plain(e)) return;
        e.preventDefault();
        e.stopPropagation();
        workspace.openTool(tool, item ?? null);
      }}
    >
      {children}
    </a>
  );
}

/** Selects a machine (and optional component) on the canvas without closing the drawer. */
export function StationLink({ station, comp, tab, className, children }: { station: StationId; comp?: string | null; tab?: InspectorTab; className?: string; children: ReactNode }) {
  const q = new URLSearchParams({ station, ...(comp ? { comp } : {}) });
  return (
    <a
      className={className}
      href={`/production?${q}`}
      onClick={(e) => {
        if (!plain(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (comp) workspace.selectComponent(station, comp);
        else workspace.select(station, { inspector: true });
        workspace.openInspector(tab ?? (comp ? 'parts' : 'overview'));
        if (comp) focusComponent(station, comp);
        else focusStation(station);
      }}
    >
      {children}
    </a>
  );
}

/** Opens the asset page and selects the same part on the canvas: one selection, two views. */
export function AssetLink({ station, comp, className, children }: { station: StationId; comp: string; className?: string; children: ReactNode }) {
  const q = new URLSearchParams({ tool: 'assets', item: comp });
  return (
    <a
      className={className}
      href={`/production?${q}`}
      onClick={(e) => {
        if (!plain(e)) return;
        e.preventDefault();
        e.stopPropagation();
        workspace.openTool('assets', comp);
        workspace.selectComponent(station, comp);
        focusComponent(station, comp);
      }}
    >
      {children}
    </a>
  );
}
