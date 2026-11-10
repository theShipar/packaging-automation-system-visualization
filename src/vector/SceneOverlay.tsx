import { project } from '../camera/camera';
import { useCamera } from '../camera/controller';
import { COMPONENTS, FAULT_DEF, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { stationView } from '../domain/kpis';
import { STATION_IDS, type Session, type StationId } from '../domain/types';
import type { Badge } from '../transport/queueLayout';
import { StatusDot, statusLabel } from '../ui/Status';
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
  for (const t of order) {
    if (t.hidden) continue;
    const w = t.full ? FULL_W : NUM_W;
    const hit = placed.find((p) => Math.abs(p.x - t.x) < ((p.full ? FULL_W : NUM_W) + w) / 2 - 4 && Math.abs(p.y - t.y) < TAG_H);
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
  const tip = cb ? project(c, (cb.minX + cb.maxX) / 2, cb.minY) : null;

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
        const [x, y] = project(c, ...screenAt(b.at));
        if (x < left || x > right || y < top || y > bottom) return null;
        return (
          <span key={b.key} className="q-badge" style={at(x, y + 10 * c.s)} title={b.label}>
            +{b.count}
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
      {tip && hoverComp && (
        <div className="comp-tip" style={at(tip[0], tip[1] - 8, true)}>
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
