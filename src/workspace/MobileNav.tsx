import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { store, useUi } from '../app/store';
import { focusStation } from '../camera/commands';
import { demo } from '../demo/demo';
import { FAULT_DEF, STATIONS } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { stationView } from '../domain/kpis';
import { IcoChart, IcoClose, IcoEvents, IcoGrid, IcoLine, IcoMore, IcoPlay, IcoSave } from '../ui/Icons';
import { StatusPill } from '../ui/Status';
import { OVERLAYS_CHANGED } from './CanvasRegion';
import { LayerPicker, MODE_META, RestoreButton, enterMode } from './ModeBar';
import { usePhone } from './usePhone';
import { useSheet } from './useSheet';
import { TOOLS } from './WorkspaceRail';
import { MODES, useWorkspace, workspace, type Layer, type Mode, type Tool } from './workspaceStore';

type Sheet = 'machines' | 'more' | null;
type Tab = 'line' | 'machines' | 'events' | 'analytics' | 'more';

const TAB_TOOLS: Tool[] = ['events', 'analytics'];
const MORE_TOOLS = TOOLS.filter((t) => !TAB_TOOLS.includes(t.id));

const TAB_ORDER: Tab[] = ['line', 'machines', 'events', 'analytics', 'more'];

/** Publishes the dock's footprint so sheets can run underneath it and keep their content clear. */
function useDockHeight(ref: React.RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      const h = el.offsetParent === null ? 0 : Math.max(0, innerHeight - el.getBoundingClientRect().top);
      root.style.setProperty('--m-nav-h', `${Math.round(h)}px`);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    addEventListener('resize', update);
    update();
    return () => {
      ro.disconnect();
      removeEventListener('resize', update);
      root.style.removeProperty('--m-nav-h');
    };
  }, [ref]);
}

/** Phone navigation: a floating two-tier dock (modes over sections) replaces the side rail. Hidden above 600 px. */
export function MobileNav() {
  const w = useWorkspace();
  const [sheet, setSheet] = useState<Sheet>(null);
  const dock = useRef<HTMLDivElement>(null);
  useDockHeight(dock);
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

  const phone = usePhone();
  const compact = active !== 'line' || (w.inspectorOpen && w.station !== null);
  return (
    <>
      {sheet && <NavSheet kind={sheet} onClose={() => setSheet(null)} />}
      <div ref={dock} className={`m-dock${compact ? ' compact' : ''}`}>
        {phone && !compact && <ModeTier mode={w.mode} layer={w.layer} />}
        <nav className="m-tabs" aria-label="Sections" style={{ '--i': TAB_ORDER.indexOf(active) } as React.CSSProperties}>
          <span className="m-ind" aria-hidden />
          <TabBtn tab="line" active={active} onGo={go} icon={<IcoLine />} label="Line" />
          <TabBtn tab="machines" active={active} onGo={go} icon={<IcoGrid />} label="Machines" />
          <TabBtn tab="events" active={active} onGo={go} icon={<IcoEvents />} label="Events" />
          <TabBtn tab="analytics" active={active} onGo={go} icon={<IcoChart />} label="Analytics" />
          <TabBtn tab="more" active={active} onGo={go} icon={<IcoMore />} label="More" />
        </nav>
      </div>
    </>
  );
}

/** Upper tier: the four modes as one visible segmented control, plus the data layer and restore. */
function ModeTier({ mode, layer }: { mode: Mode; layer: Layer }) {
  return (
    <div className="m-modes" role="group" aria-label="Workspace mode and layer">
      <div className="m-seg" role="radiogroup" aria-label="Mode" style={{ '--i': MODES.indexOf(mode) } as React.CSSProperties}>
        <span className="m-seg-ind" aria-hidden />
        {MODES.map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => enterMode(m)}>
            {MODE_META[m].label}
          </button>
        ))}
      </div>
      <LayerPicker layer={layer} />
      <RestoreButton />
    </div>
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
    </>
  );
}
