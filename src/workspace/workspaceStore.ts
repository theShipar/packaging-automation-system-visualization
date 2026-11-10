/*
 * Workspace UI state: one canonical selection, the open tool drawer, the inspector dock and the mode.
 * Never touches the simulation session; domain changes go through `store.command`.
 */
import { useSyncExternalStore } from 'react';
import { pref, setPref } from '../app/persist';
import { STATION_IDS, type StationId } from '../domain/types';

export type Mode = 'explore' | 'operate' | 'diagnose' | 'experiment';
export type Tool = 'batches' | 'scenarios' | 'analytics' | 'assets' | 'events' | 'maintenance' | 'quality' | 'reports' | 'settings';
export type InspectorTab = 'overview' | 'parts' | 'activity' | 'config';
export type Layer = 'flow' | 'capacity' | 'health' | 'quality' | 'energy';

export const MODES: Mode[] = ['explore', 'operate', 'diagnose', 'experiment'];
export const TOOLS: Tool[] = ['batches', 'scenarios', 'analytics', 'assets', 'events', 'maintenance', 'quality', 'reports', 'settings'];
export const INSPECTOR_WIDTHS = { min: 320, standard: 380, max: 440 } as const;
export const INSPECTOR_PRESETS = [INSPECTOR_WIDTHS.min, INSPECTOR_WIDTHS.standard, INSPECTOR_WIDTHS.max] as const;
/** Nearest preset width, for snapping after a drag. */
export const snapWidth = (w: number) => INSPECTOR_PRESETS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));

export interface WorkspaceState {
  mode: Mode;
  tool: Tool | null;
  /** Detail id inside the tool (batch id, asset id, scenario id). */
  item: string | null;
  drawerWidth: number;
  inspectorOpen: boolean;
  inspectorWidth: number;
  inspectorTab: InspectorTab;
  station: StationId | null;
  comp: string | null;
  hover: string | null;
  layer: Layer;
  /** Open the inspector automatically when a station is selected. */
  autoInspector: boolean;
}

type L = () => void;

const clampW = (w: number) => Math.round(Math.min(INSPECTOR_WIDTHS.max, Math.max(INSPECTOR_WIDTHS.min, w)));

class WorkspaceStore {
  state: WorkspaceState = {
    mode: pref<Mode>('mode', 'explore'),
    tool: null,
    item: null,
    drawerWidth: pref<number>('drawerWidth', 440),
    inspectorOpen: false,
    inspectorWidth: clampW(pref<number>('inspectorWidth', INSPECTOR_WIDTHS.standard)),
    inspectorTab: 'overview',
    station: null,
    comp: null,
    hover: null,
    layer: pref<Layer>('layer', 'flow'),
    autoInspector: pref<boolean>('autoInspector', true),
  };
  private ls = new Set<L>();

  subscribe = (l: L) => {
    this.ls.add(l);
    return () => this.ls.delete(l);
  };
  get = () => this.state;

  private set(patch: Partial<WorkspaceState>) {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof WorkspaceState)[]) if (this.state[k] !== patch[k]) changed = true;
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    this.ls.forEach((l) => l());
  }

  /* ---- selection ---- */
  select(station: StationId | null, opts: { inspector?: boolean } = {}) {
    if (station === null) return this.set({ station: null, comp: null, inspectorOpen: false });
    const sameStation = station === this.state.station;
    const open = opts.inspector ?? (this.state.inspectorOpen || this.state.autoInspector);
    this.set({ station, comp: sameStation ? this.state.comp : null, inspectorOpen: open, inspectorTab: sameStation ? this.state.inspectorTab : 'overview' });
  }
  /** One selection everywhere: an open asset page follows the selected part. */
  selectComponent(station: StationId, comp: string | null) {
    const followAsset = comp && this.state.tool === 'assets' && this.state.item !== null;
    this.set({ station, comp, inspectorOpen: this.state.inspectorOpen || this.state.autoInspector, inspectorTab: comp ? 'parts' : this.state.inspectorTab, ...(followAsset ? { item: comp } : {}) });
  }
  setHover(id: string | null) {
    this.set({ hover: id });
  }
  /** Escape ladder: component → machine → nothing. Returns false when there was nothing to clear. */
  back(): boolean {
    if (this.state.comp) return this.set({ comp: null }), true;
    if (this.state.station) return this.set({ station: null, inspectorOpen: false }), true;
    return false;
  }

  /* ---- inspector ---- */
  openInspector(tab?: InspectorTab) {
    if (!this.state.station) return;
    this.set({ inspectorOpen: true, inspectorTab: tab ?? this.state.inspectorTab });
  }
  closeInspector() {
    this.set({ inspectorOpen: false });
  }
  setInspectorTab(tab: InspectorTab) {
    this.set({ inspectorTab: tab });
  }
  setInspectorWidth(w: number) {
    const width = clampW(w);
    this.set({ inspectorWidth: width });
    setPref('inspectorWidth', width);
  }
  setAutoInspector(on: boolean) {
    this.set({ autoInspector: on });
    setPref('autoInspector', on);
  }

  /* ---- tools ---- */
  openTool(tool: Tool | null, item: string | null = null) {
    this.set({ tool, item: tool ? item : null });
  }
  toggleTool(tool: Tool) {
    this.openTool(this.state.tool === tool ? null : tool);
  }
  setDrawerWidth(w: number) {
    const width = Math.round(Math.min(760, Math.max(320, w)));
    this.set({ drawerWidth: width });
    setPref('drawerWidth', width);
  }

  /* ---- mode and layers ---- */
  setMode(mode: Mode) {
    this.set({ mode });
    setPref('mode', mode);
  }
  setLayer(layer: Layer) {
    this.set({ layer });
    setPref('layer', layer);
  }

  /* ---- URL (deep links) ---- */
  fromUrl(p: URLSearchParams) {
    const st = p.get('station');
    const station = st && (STATION_IDS as readonly string[]).includes(st) ? (st as StationId) : null;
    const tl = p.get('tool');
    const tool = tl && (TOOLS as string[]).includes(tl) ? (tl as Tool) : null;
    const patch: Partial<WorkspaceState> = { station, comp: station ? p.get('comp') : null, tool, item: tool ? p.get('item') : null };
    if (station && (p.get('details') === '1' || (station !== this.state.station && this.state.autoInspector))) patch.inspectorOpen = true;
    if (!station) patch.inspectorOpen = false;
    this.set(patch);
  }
  toUrl(base: URLSearchParams): string {
    const p = new URLSearchParams(base);
    for (const k of ['station', 'comp', 'tool', 'item', 'details']) p.delete(k);
    const s = this.state;
    if (s.station) p.set('station', s.station);
    if (s.station && s.comp) p.set('comp', s.comp);
    if (s.tool) p.set('tool', s.tool);
    if (s.tool && s.item) p.set('item', s.item);
    const q = p.toString();
    return q ? `?${q}` : '';
  }
}

export const workspace = new WorkspaceStore();

export function useWorkspace(): WorkspaceState {
  return useSyncExternalStore(workspace.subscribe, workspace.get);
}
