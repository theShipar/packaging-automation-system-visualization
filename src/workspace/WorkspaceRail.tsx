import type { ReactNode } from 'react';
import { IcoAsset, IcoBatch, IcoChart, IcoCheck, IcoEvents, IcoGear, IcoLab, IcoLine, IcoReport, IcoWrench } from '../ui/Icons';
import { useWorkspace, workspace, type Tool } from './workspaceStore';

export const TOOLS: { id: Tool; label: string; icon: ReactNode; hint: string }[] = [
  { id: 'batches', label: 'Batches', icon: <IcoBatch />, hint: 'Live batch, reconciliation and history' },
  { id: 'scenarios', label: 'Scenario lab', icon: <IcoLab />, hint: 'Run what-if scenarios against the baseline' },
  { id: 'assets', label: 'Assets', icon: <IcoAsset />, hint: 'Machines and components' },
  { id: 'events', label: 'Events', icon: <IcoEvents />, hint: 'Event log for this run' },
  { id: 'quality', label: 'Quality', icon: <IcoCheck />, hint: 'Inspections, defects and QA rule' },
  { id: 'maintenance', label: 'Maintenance', icon: <IcoWrench />, hint: 'Work orders and schedules' },
  { id: 'analytics', label: 'Analytics', icon: <IcoChart />, hint: 'Live run and daily history' },
  { id: 'reports', label: 'Reports', icon: <IcoReport />, hint: 'Exports for this run' },
  { id: 'settings', label: 'Settings', icon: <IcoGear />, hint: 'Role, motion and data' },
];

export const toolLabel = (t: Tool) => TOOLS.find((x) => x.id === t)?.label ?? t;

export function WorkspaceRail() {
  const w = useWorkspace();
  return (
    <nav className="rail" aria-label="Workspace tools">
      <button className={`rail-btn${w.tool ? '' : ' on'}`} aria-pressed={!w.tool} aria-label="Production canvas" onClick={() => workspace.openTool(null)}>
        <IcoLine />
        <span className="tip" role="tooltip">
          Production canvas
        </span>
      </button>
      <span className="rail-sep" aria-hidden />
      {TOOLS.map((t) => (
        <button key={t.id} className={`rail-btn${w.tool === t.id ? ' on' : ''}`} aria-pressed={w.tool === t.id} aria-label={t.label} onClick={() => workspace.toggleTool(t.id)}>
          {t.icon}
          <span className="tip" role="tooltip">
            {t.label}
            <small>{t.hint}</small>
          </span>
        </button>
      ))}
      <span className="rail-fill" />
      <span className="rail-sim" title="Every number on screen comes from the offline simulation. No machine is connected.">
        SIM
      </span>
    </nav>
  );
}
