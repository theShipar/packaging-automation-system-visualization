import { useEffect, useState, type ReactNode } from 'react';
import { store, useUi } from '../app/store';
import avatar from '../assets/theshipar.jpg';
import { focusStation } from '../camera/commands';
import { demo } from '../demo/demo';
import { FAULT_DEF, STATIONS } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { stationView } from '../domain/kpis';
import { IcoChart, IcoClose, IcoEvents, IcoGrid, IcoLine, IcoMore, IcoPlay, IcoSave } from '../ui/Icons';
import { StatusPill } from '../ui/Status';
import { OVERLAYS_CHANGED } from './CanvasRegion';
import { useSheet } from './useSheet';
import { TOOLS } from './WorkspaceRail';
import { useWorkspace, workspace, type Tool } from './workspaceStore';

type Sheet = 'machines' | 'more' | null;
type Tab = 'line' | 'machines' | 'events' | 'analytics' | 'more';

const TAB_TOOLS: Tool[] = ['events', 'analytics'];
const MORE_TOOLS = TOOLS.filter((t) => !TAB_TOOLS.includes(t.id));

/** Phone navigation: a bottom tab bar replaces the side rail. Hidden above 600 px. */
export function MobileNav() {
  const w = useWorkspace();
  const [sheet, setSheet] = useState<Sheet>(null);
  useEffect(() => {
    if (w.tool) setSheet(null);
  }, [w.tool]);
  useEffect(() => {
    if (w.inspectorOpen && w.station) setSheet(null);
  }, [w.inspectorOpen, w.station]);

  const active: Tab = sheet ?? (w.tool === 'events' || w.tool === 'analytics' ? w.tool : w.tool ? 'more' : 'line');
  const go = (tab: Tab) => {
    if (tab === 'line') {
      setSheet(null);
      workspace.openTool(null);
    } else if (tab === 'machines' || tab === 'more') {
      if (active === tab) return setSheet(null);
      workspace.openTool(null);
      setSheet(tab);
    } else workspace.openTool(w.tool === tab ? null : tab);
  };

  return (
    <>
      {sheet && <NavSheet kind={sheet} onClose={() => setSheet(null)} />}
      <nav className="m-tabs" aria-label="Sections">
        <TabBtn tab="line" active={active} onGo={go} icon={<IcoLine />} label="Line" />
        <TabBtn tab="machines" active={active} onGo={go} icon={<IcoGrid />} label="Machines" />
        <TabBtn tab="events" active={active} onGo={go} icon={<IcoEvents />} label="Events" />
        <TabBtn tab="analytics" active={active} onGo={go} icon={<IcoChart />} label="Analytics" />
        <TabBtn tab="more" active={active} onGo={go} icon={<IcoMore />} label="More" />
      </nav>
    </>
  );
}

function TabBtn({ tab, active, onGo, icon, label }: { tab: Tab; active: Tab; onGo: (t: Tab) => void; icon: ReactNode; label: string }) {
  return (
    <button className={`m-tab${active === tab ? ' on' : ''}`} aria-current={active === tab ? 'page' : undefined} onClick={() => onGo(tab)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NavSheet({ kind, onClose }: { kind: 'machines' | 'more'; onClose: () => void }) {
  const sheet = useSheet(onClose);
  useEffect(() => {
    dispatchEvent(new Event(OVERLAYS_CHANGED));
    return () => void dispatchEvent(new Event(OVERLAYS_CHANGED));
  }, []);
  const title = kind === 'machines' ? 'Machines' : 'More';
  return (
    <section className="m-sheet" role="dialog" aria-label={title} data-sheet-size={sheet.size}>
      <button className="sheet-grab" {...sheet.grab} />
      <header className="m-sheet-head">
        <h2>{title}</h2>
        {kind === 'machines' && <span className="muted">Tap one to inspect it</span>}
        <span className="spacer" />
        <button className="icon-btn sm" onClick={onClose} aria-label={`Close ${title}`}>
          <IcoClose />
        </button>
      </header>
      <div className="m-sheet-body">{kind === 'machines' ? <MachineList onPick={onClose} /> : <MoreList onPick={onClose} />}</div>
    </section>
  );
}

function MachineList({ onPick }: { onPick: () => void }) {
  const s = useUi();
  const w = useWorkspace();
  return (
    <ul className="m-list">
      {STATIONS.map((m) => {
        const v = stationView(s, m.id);
        const fault = s.faults.find((f) => f.station === m.id && isOpenFault(f));
        return (
          <li key={m.id}>
            <button
              className={`m-row${w.station === m.id ? ' on' : ''}`}
              onClick={() => {
                onPick();
                workspace.select(m.id, { inspector: true });
                focusStation(m.id);
              }}
            >
              <span className="m-no num">{m.no}</span>
              <span className="m-main">
                <b>{m.name}</b>
                <small>{fault ? FAULT_DEF[fault.code].title : `${v.inQueue} waiting · ${v.completed.toLocaleString()} done`}</small>
              </span>
              <StatusPill status={v.status} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MoreList({ onPick }: { onPick: () => void }) {
  return (
    <>
      <ul className="m-list">
        {MORE_TOOLS.map((t) => (
          <li key={t.id}>
            <button className="m-row" onClick={() => workspace.openTool(t.id)}>
              <span className="m-ico">{t.icon}</span>
              <span className="m-main">
                <b>{t.label}</b>
                <small>{t.hint}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="m-sec">Run</div>
      <ul className="m-list">
        <li>
          <button className="m-row" onClick={() => (onPick(), demo.intro())}>
            <span className="m-ico">
              <IcoPlay />
            </span>
            <span className="m-main">
              <b>Guided demo</b>
              <small>Five short scenes, about two minutes</small>
            </span>
          </button>
        </li>
        <li>
          <button className="m-row" onClick={() => (onPick(), void store.save())}>
            <span className="m-ico">
              <IcoSave />
            </span>
            <span className="m-main">
              <b>Save snapshot</b>
              <small>Keep this run in the browser</small>
            </span>
          </button>
        </li>
      </ul>
      <a className="m-credit" href="https://shipar.vercel.app/" target="_blank" rel="noopener noreferrer">
        <img src={avatar} alt="" width={40} height={40} />
        <span className="m-main">
          <b>Created by TheShipar</b>
          <small>shipar.vercel.app ↗</small>
        </span>
      </a>
    </>
  );
}
