import type { ReactNode } from 'react';
import { project } from '../camera/camera';
import { useCamera } from '../camera/controller';
import { COMPONENTS, FAULT_DEF, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { defectPareto, lineKpis, stationView } from '../domain/kpis';
import { STATION_IDS, type Session, type StationId } from '../domain/types';
import type { Badge } from '../transport/queueLayout';
import { StatusDot, statusLabel } from '../ui/Status';
import { useWorkspace, type Layer } from '../workspace/workspaceStore';
import { FLOW_MARKS, GEOMETRY, screenAt } from './sceneModel';

const COMP_NAME = Object.fromEntries(COMPONENTS.map((c) => [c.id, c.name])) as Record<string, string>;
const COMP_STATION = Object.fromEntries(COMPONENTS.map((c) => [c.id, c.station])) as Record<string, StationId>;
const TAG_H = 26;
const NUM_W = 30;
const FULL_W = 230;

export type Lod = 'far' | 'mid' | 'near';
export const lodOf = (ratio: number): Lod => (ratio < 1.4 ? 'far' : ratio < 2.4 ? 'mid' : 'near');

interface Props {
  s: Session;
  selected: StationId | null;
  hover: StationId | null;
  hoverComp: string | null;
  badges: Badge[];
  onSelect: (id: StationId) => void;
  onHover: (id: StationId | null) => void;
}

/**
 * Everything that must stay a readable CSS-pixel size: station tags, queue counts, flow marks and
 * the part tooltip. Positions come from world anchors through the camera every frame.
 */
export function SceneOverlay({ s, selected, hover, hoverComp, badges, onSelect, onHover }: Props) {
  const cam = useCamera();
  const layer = useWorkspace().layer;
  const c = cam.cam;
  const r = cam.safe;
  if (!r) return null;
  const lod = lodOf(cam.zoomRatio());
  const left = r.x - 4, right = r.x + r.w + 4, top = 8, bottom = r.y + r.h + 40;

  type Tag = { id: StationId; x: number; y: number; full: boolean; alert: boolean; extra: StationId[]; hidden: boolean };
  const tags: Tag[] = STATION_IDS.map((id) => {
    const [x, y] = project(c, ...GEOMETRY[id].label);
    const v = stationView(s, id);
    const alert = v.status === 'faulted' || v.status === 'maintenance';
    const full = id === selected || id === hover || alert || lod === 'near';
    return { id, x, y, full, alert, extra: [], hidden: x < left - 60 || x > right + 60 || y < top - 40 || y > bottom + 40 };
  });
  const order = [...tags].sort((a, b) => rank(b, selected, hover) - rank(a, selected, hover));
  const placed: Tag[] = [];
  // A layer chip hangs under each tag, so tags need twice the vertical room while a layer is on.
  const rowH = layer === 'flow' ? TAG_H : TAG_H * 2 + 4;
  for (const t of order) {
    if (t.hidden) continue;
    const w = t.full ? FULL_W : NUM_W;
    const hit = placed.find((p) => Math.abs(p.x - t.x) < ((p.full ? FULL_W : NUM_W) + w) / 2 - 4 && Math.abs(p.y - t.y) < rowH);
    if (hit) {
      hit.extra.push(t.id);
      t.hidden = true;
    } else placed.push(t);
  }

  const showMarks = lod !== 'near';
  const entry = project(c, ...FLOW_MARKS.entry);
  const exit = project(c, ...FLOW_MARKS.exit);
  const hc = hoverComp ? COMP_STATION[hoverComp] : null;
  const cb = hoverComp && hc ? GEOMETRY[hc].compBounds[hoverComp] : null;
  const tipTop = cb ? project(c, (cb.minX + cb.maxX) / 2, cb.minY) : null;
  // keep the tooltip inside the safe rect (never under the inspector or a panel); flip below when there is no room above
  const tipHalf = hoverComp ? `${COMP_NAME[hoverComp] ?? hoverComp} ${hoverComp}`.length * 3.6 + 14 : 0;
  const flip = tipTop !== null && tipTop[1] - 8 - TIP_H < 8;
  const tipAt = cb && tipTop ? (flip ? project(c, (cb.minX + cb.maxX) / 2, cb.maxY) : tipTop) : null;
  const tip = tipAt ? ([Math.min(Math.max(tipAt[0], r.x + tipHalf), r.x + r.w - tipHalf), tipAt[1]] as const) : null;

  return (
    <div className="scene-ov" aria-hidden={false}>
      {showMarks && (
        <>
          <span className="flow-mark" style={at(entry[0], entry[1] + 18 * Math.min(1.4, c.s))}>
            Goods in
          </span>
          <span className="flow-mark" style={at(exit[0], exit[1] + 18 * Math.min(1.4, c.s))}>
            Shipped
          </span>
        </>
      )}
      {badges.map((b) => {
        if (lod === 'far' && b.count < 3) return null;
        const [x, y] = project(c, ...screenAt(b.at));
        if (x < left || x > right || y < top || y > bottom) return null;
        return (
          <span key={b.key} className="q-badge" style={at(x, y + 10 * c.s)} title={b.label}>
            {lod !== 'near' && b.count > 20 ? '20+' : `+${b.count}`}
          </span>
        );
      })}
      {tags.map((t) =>
        t.hidden ? null : (
          <StationTag
            key={t.id}
            s={s}
            id={t.id}
            x={Math.min(right - (t.full ? 60 : 16), Math.max(left + (t.full ? 60 : 16), t.x))}
            y={Math.min(bottom - TAG_H, Math.max(top, t.y))}
            full={t.full}
            sel={t.id === selected}
            alert={t.alert}
            extra={t.extra}
            onSelect={onSelect}
            onHover={onHover}
          />
        ),
      )}
      {layer !== 'flow' &&
        tags.map((t) => {
          if (t.hidden) return null;
          const chip = layerChip(s, t.id, layer);
          if (!chip) return null;
          const x = Math.min(right - 60, Math.max(left + 60, t.x));
          const y = Math.min(bottom - TAG_H, Math.max(top, t.y)) + TAG_H + 4;
          return (
            <span key={`chip-${t.id}`} className={`layer-chip ${chip.tone}`} data-station={t.id} data-layer={layer} style={at(x, y)} title={chip.title}>
              {chip.body}
            </span>
          );
        })}
      {tip && hoverComp && (
        <div className="comp-tip" style={flip ? at(tip[0], tip[1] + 8) : at(tip[0], tip[1] - 8, true)}>
          <b>{COMP_NAME[hoverComp] ?? hoverComp}</b> <span className="mono">{hoverComp}</span>
        </div>
      )}
    </div>
  );
}

function rank(t: { id: StationId; alert: boolean }, selected: StationId | null, hover: StationId | null) {
  return (t.id === selected ? 8 : 0) + (t.id === hover ? 4 : 0) + (t.alert ? 2 : 0) - STATION_IDS.indexOf(t.id) * 0.01;
}

/** Centre horizontally on the anchor; `up` places the element above it. */
const TIP_H = 26;
const at = (x: number, y: number, up = false) => ({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, ${up ? '-100%' : '0'})` });

/** Numeral at a distance; name, state and two numbers when hovered, selected, alerting or close. */
function StationTag({ s, id, x, y, full, sel, alert, extra, onSelect, onHover }: { s: Session; id: StationId; x: number; y: number; full: boolean; sel: boolean; alert: boolean; extra: StationId[]; onSelect: (id: StationId) => void; onHover: (id: StationId | null) => void }) {
  const meta = STATION_META[id];
  const v = stationView(s, id);
  const fault = s.faults.find((f) => f.station === id && isOpenFault(f));
  return (
    <button
      className={`st-label${full ? ' full' : ''}${sel ? ' sel' : ''}${alert ? ' alert' : ''}`}
      style={at(x, y)}
      onClick={() => onSelect(id)}
      onPointerEnter={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
      tabIndex={-1}
      aria-hidden
    >
      <span className="st-no">{meta.no}</span>
      {full && (
        <span className="st-more">
          <span className="st-name">{meta.short}</span>
          <span className={`st-state s-${v.status}`}>
            <StatusDot status={v.status} /> {fault ? FAULT_DEF[fault.code].title : statusLabel(v.status)}
          </span>
          {!fault && (
            <span className="st-meta num">
              {(v.avgCycle ?? s.config[id].cycleSeconds).toFixed(1)} s · in {v.inQueue + v.incoming}/{v.inCap}
            </span>
          )}
        </span>
      )}
      {extra.length > 0 && (
        <span className="st-extra" title={extra.map((e) => STATION_META[e].name).join(', ')}>
          +{extra.length}
        </span>
      )}
    </button>
  );
}

type Chip = { body: ReactNode; tone: '' | 'warn' | 'bad' | 'good'; title: string };

const Meter = ({ v, max }: { v: number; max: number }) => (
  <span className="meter" aria-hidden>
    <i style={{ width: `${Math.min(1, max ? v / max : 0) * 100}%` }} />
  </span>
);

/** One data layer's reading for a machine, from the same selectors as the panels. */
function layerChip(s: Session, id: StationId, layer: Layer): Chip | null {
  const v = stationView(s, id);
  const st = s.stations[id];
  const total = Object.values(st.timeIn).reduce((a, b) => a + b, 0);
  switch (layer) {
    case 'capacity': {
      const inN = v.inQueue + v.incoming;
      const full = inN >= v.inCap || v.outQueue >= v.outCap;
      return {
        tone: full ? 'warn' : '',
        title: `Input ${inN}/${v.inCap} (incl. ${v.incoming} arriving) · ${id === 'dispatch' ? 'staged' : 'output'} ${v.outQueue}/${v.outCap}`,
        body: (
          <>
            <span className="k">In</span> <b className="num">{inN}/{v.inCap}</b> <Meter v={inN} max={v.inCap} />
            <span className="k">Out</span> <b className="num">{v.outQueue}/{v.outCap}</b> <Meter v={v.outQueue} max={v.outCap} />
          </>
        ),
      };
    }
    case 'health': {
      const down = st.timeIn.faulted + st.timeIn.maintenance;
      const open = v.openFaults;
      if (total < 60 && !open) return { tone: '', title: 'Less than a minute of runtime', body: <span className="k">No runtime yet</span> };
      const up = total ? 1 - down / total : 1;
      return {
        tone: open ? 'bad' : up < 0.97 ? 'warn' : 'good',
        title: `Uptime ${(up * 100).toFixed(1)}% this run (fault + repair ${Math.round(down)} s of ${Math.round(total)} s)`,
        body: (
          <>
            <StatusDot status={v.status} /> <b className="num">{(up * 100).toFixed(1)}%</b> <span className="k">up</span>
            {open > 0 && <span className="k strong">· {open} open</span>}
          </>
        ),
      };
    }
    case 'quality': {
      if (id !== 'qa') return null;
      const k = lineKpis(s);
      const rej = s.inspections.length - s.inspections.filter((i) => i.result === 'pass').length;
      const top = defectPareto(s)[0];
      if (!k.inspected) return { tone: '', title: 'No kits inspected yet', body: <span className="k">No inspections yet</span> };
      return {
        tone: (k.yieldPct ?? 1) < 0.95 ? 'bad' : (k.yieldPct ?? 1) < 0.98 ? 'warn' : 'good',
        title: `${k.inspected} inspected · ${rej} rejected${top ? ` · top defect ${top.code} (${top.count})` : ''}`,
        body: (
          <>
            <span className="k">Yield</span> <b className="num">{((k.yieldPct ?? 0) * 100).toFixed(1)}%</b>
            <span className="k">· {rej} rej</span>
            {top && <span className="k mono">· {top.code.toLowerCase().replace(/_/g, ' ')}</span>}
          </>
        ),
      };
    }
    case 'energy': {
      let sum = 0;
      for (const x of STATION_IDS) sum += s.stations[x].energyKWh;
      const share = sum ? st.energyKWh / sum : 0;
      return {
        tone: '',
        title: `Simulated: ${st.energyKWh.toFixed(3)} kWh this run, ${(share * 100).toFixed(0)}% of the line. Modelled, not metered.`,
        body: (
          <>
            <b className="num">{st.energyKWh.toFixed(2)}</b> <span className="k">kWh</span> <Meter v={share} max={1} /> <span className="k num">{(share * 100).toFixed(0)}%</span>
          </>
        ),
      };
    }
    default:
      return null;
  }
}
