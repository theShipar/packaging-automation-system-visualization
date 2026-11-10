import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as RPE } from 'react';
import { store, useFrame } from '../app/store';
import { COMPONENTS, FAULT_DEF, STATION_META } from '../domain/config';
import { unitOf } from '../domain/core';
import { isOpenFault } from '../domain/engine';
import { effectiveStatus, stationView } from '../domain/kpis';
import { STATION_IDS, type Session, type StationId } from '../domain/types';
import { FollowCard } from '../features/follow-product/FollowCard';
import { clampView, useFollowCamera, type Cam2D } from '../features/follow-product/useFollowCamera';
import { LANES } from '../transport/graph';
import { PORTS, lanePoint } from '../transport/layout';
import { machinePose, type UnitPose } from '../transport/poses';
import { queueBadges } from '../transport/queueLayout';
import { StatusDot, StatusPill, statusLabel } from '../ui/Status';
import { type MachinePose } from './builder';
import { setReducedMotion } from './iso';
import { Shapes, productItems } from './ProductLayer';
import {
  CONNECTOR_SHAPES,
  FLOW_MARKS,
  GEOMETRY,
  VIEW_H,
  VIEW_W,
  drawStation,
  screenAt,
  type StationDrawing,
} from './sceneModel';

const COMP_STATION = Object.fromEntries(COMPONENTS.map((c) => [c.id, c.station])) as Record<string, StationId>;
const COMP_NAME = Object.fromEntries(COMPONENTS.map((c) => [c.id, c.name])) as Record<string, string>;
const FAR_TO_NEAR = [...STATION_IDS].reverse();
const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const DEBUG = params.get('debug') === 'transport';
const PERF = params.has('perf') || DEBUG;

function faultComp(s: Session, id: StationId): string | null {
  const f = s.faults.find((x) => x.station === id && isOpenFault(x));
  return f ? f.componentId : null;
}

function poseKey(p: MachinePose, hi: string | null) {
  const r = p.robot;
  return [p.m === null ? '-' : p.m.toFixed(4), p.done ? 1 : 0, p.status, p.hover.toFixed(3), p.supply, p.rejectAge === null ? '-' : p.rejectAge.toFixed(3), r ? `${r.th.toFixed(3)},${r.a1.toFixed(4)},${r.a2.toFixed(4)},${r.e.toFixed(3)}` : '', hi ?? ''].join('|');
}

interface Props {
  selected: StationId | null;
  selectedComp: string | null;
  onSelect: (id: StationId | null) => void;
  onSelectComp: (comp: string | null) => void;
  /** Opens the full station details (the drawer). */
  onOpen: () => void;
  /** The anchored glance card; hidden while the drawer is open. */
  showCard: boolean;
}

export function Scene({ selected, selectedComp, onSelect, onSelectComp, onOpen, showCard }: Props) {
  const s = useFrame();
  const [hoverStation, setHoverStation] = useState<StationId | null>(null);
  const [hoverComp, setHoverComp] = useState<string | null>(null);
  const cache = useRef(new Map<StationId, { key: string; d: StationDrawing }>());
  const [, force] = useReducer((x: number) => x + 1, 0);
  const view = useRef<Cam2D>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const aspect = useRef<HTMLDivElement>(null);
  const follow = store.follow;
  useFollowCamera({ follow, view, wrap, aspect, viewW: VIEW_W, viewH: VIEW_H, screenAt, stationCenter: centerOf });

  /* ---- build this frame ---- */
  const drawings = {} as Record<StationId, StationDrawing>;
  const status = {} as Record<StationId, string>;
  for (const id of STATION_IDS) {
    const hc = hoverComp && COMP_STATION[hoverComp] === id ? hoverComp : selectedComp && COMP_STATION[selectedComp] === id ? selectedComp : faultComp(s, id);
    const pose = machinePose(s, id, 0);
    const key = poseKey(pose, hc);
    const hit = cache.current.get(id);
    if (hit && hit.key === key) drawings[id] = hit.d;
    else {
      const d = drawStation(id, pose, hc);
      cache.current.set(id, { key, d });
      drawings[id] = d;
    }
    status[id] = `station st-${effectiveStatus(s, id)}${id === selected ? ' is-focus' : ''}${id === hoverStation ? ' is-hover' : ''}`;
  }

  const { units, items } = productItems(s, follow);
  for (const id of STATION_IDS)
    for (const g of drawings[id].fronts)
      items.push({
        key: `${id}:${g.name}`,
        depth: g.key,
        node: (
          <g key={`${id}:${g.name}`} className={status[id]}>
            <Shapes shapes={g.shapes} />
          </g>
        ),
      });
  items.sort((a, b) => a.depth - b.depth || (a.key < b.key ? -1 : 1));
  const badges = queueBadges(s);

  /* ---- camera input ---- */
  const setView = (v: Cam2D) => {
    view.current = v;
    force();
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = wrap.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const v = view.current;
    const k = Math.min(3, Math.max(1, v.k * Math.exp(-e.deltaY * 0.004)));
    setView(clampView({ k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }, r.width, r.height));
  };
  const zoomBy = (f: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const v = view.current;
    const k = Math.min(3, Math.max(1, v.k * f));
    const cx = r.width / 2, cy = r.height / 2;
    setView(clampView({ k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k }, r.width, r.height));
  };
  const down = (e: RPE) => {
    if ((e.target as Element).closest('.hit, .hit-comp, .st-label, .unit, .follow-card, .focus-card')) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false };
  };
  const move = (e: RPE) => {
    const d = drag.current;
    if (!d || view.current.k === 1) return;
    const r = wrap.current!.getBoundingClientRect();
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) {
      d.moved = true;
      if (store.follow) store.setFollow(null);
    }
    setView(clampView({ k: view.current.k, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }, r.width, r.height));
  };
  const up = (e: RPE) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && !(e.target as Element).closest('.hit, .hit-comp, .st-label, button, .unit, .follow-card, .focus-card')) {
      onSelect(null);
      onSelectComp(null);
    }
  };

  const labels = useMemo(() => STATION_IDS.map((id) => ({ id, at: GEOMETRY[id].label })), []);
  const v = view.current;

  return (
    <div
      className={`scene${follow ? ' following' : ''}${hoverStation ? ' has-hover' : ''}${selected ? ' has-focus' : ''}`}
      style={{ maxWidth: `calc(var(--scene-max-h, 100vh) * ${(VIEW_W / VIEW_H).toFixed(4)})` }}
      ref={wrap} onWheel={onWheel} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => (drag.current = null)}>
      <div className="scene-inner" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}>
        <div className="scene-aspect" ref={aspect} style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          <svg viewBox={`0 0 ${VIEW_W.toFixed(1)} ${VIEW_H.toFixed(1)}`} className="hl" role="group" aria-label="Packaging line, six stations from intake (lower left) to dispatch (upper right)">
            <g className="layer-back">
              {FAR_TO_NEAR.map((id) => {
                const i = STATION_IDS.indexOf(id);
                return (
                  <g key={id}>
                    <g className={status[id]}>
                      <Shapes shapes={drawings[id].back} />
                    </g>
                    {i > 0 && (
                      <g className="conn">
                        <Shapes shapes={CONNECTOR_SHAPES[i - 1]} />
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
            <g className="layer-mid">{items.map((it) => it.node)}</g>
            <g className="layer-over">
              {STATION_IDS.map((id) => {
                const fc = faultComp(s, id);
                return fc && GEOMETRY[id].comps[fc] ? <path key={`f${id}`} d={GEOMETRY[id].comps[fc]} className="ov-fault" /> : null;
              })}
              {badges.map((b) => {
                const [x, y] = screenAt(b.at);
                return (
                  <g key={b.key} className="q-badge" transform={`translate(${x.toFixed(2)} ${(y + 16).toFixed(2)})`} aria-label={b.label}>
                    <title>{b.label}</title>
                    <rect x={-16} y={-8.5} width={32} height={17} rx={8.5} />
                    <text y={3.6}>+{b.count}</text>
                  </g>
                );
              })}
              {DEBUG && <TransportDebug s={s} units={units} />}
            </g>
            <g className="layer-hit">
              {STATION_IDS.map((id) => {
                const meta = STATION_META[id];
                return (
                  <path
                    key={`h${id}`}
                    d={GEOMETRY[id].hullD}
                    className="hit"
                    data-station={id}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selected === id}
                    aria-label={`Station ${meta.no} ${meta.name}, ${statusLabel(effectiveStatus(s, id))}`}
                    onPointerEnter={() => setHoverStation(id)}
                    onPointerLeave={() => setHoverStation((h) => (h === id ? null : h))}
                    onFocus={() => setHoverStation(id)}
                    onBlur={() => setHoverStation(null)}
                    onClick={() => {
                      onSelect(id);
                      onSelectComp(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(id);
                      }
                    }}
                  />
                );
              })}
              {selected &&
                Object.entries(GEOMETRY[selected].comps).map(([comp, d]) => (
                  <path
                    key={comp}
                    d={d}
                    className="hit-comp"
                    aria-label={`${COMP_NAME[comp] ?? comp} (${comp})`}
                    onPointerEnter={() => setHoverComp(comp)}
                    onPointerLeave={() => setHoverComp((h) => (h === comp ? null : h))}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectComp(comp);
                    }}
                  />
                ))}
              {units.map((u) => {
                const [x, y] = screenAt(u.at);
                return (
                  <circle
                    key={`t${u.id}`}
                    className="unit hit-unit"
                    cx={x}
                    cy={y - 4}
                    r={7}
                    role="button"
                    aria-label={`Follow ${unitOf(s, u.id).serial}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      store.setFollow(u.id);
                    }}
                  />
                );
              })}
            </g>
          </svg>
          <div className="flow-mark" style={pos(FLOW_MARKS.entry[0], FLOW_MARKS.entry[1] + 22)}>
            Goods in
          </div>
          <div className="flow-mark" style={pos(FLOW_MARKS.exit[0], FLOW_MARKS.exit[1] + 22)}>
            Shipped
          </div>
          {labels.map(({ id, at }) => (
            <StationLabel
              key={id}
              s={s}
              id={id}
              at={at}
              active={selected === id && showCard}
              sel={selected === id}
              hover={hoverStation === id}
              onClick={() => onSelect(id)}
              onEnter={() => setHoverStation(id)}
              onLeave={() => setHoverStation((h) => (h === id ? null : h))}
            />
          ))}
          {selected && showCard && <FocusCard s={s} id={selected} k={v.k} onOpen={onOpen} />}
          {hoverComp && (
            <div className="comp-tip" style={pos(GEOMETRY[COMP_STATION[hoverComp]].label[0], GEOMETRY[COMP_STATION[hoverComp]].label[1] + 34)}>
              <b>{COMP_NAME[hoverComp]}</b> <span className="mono">{hoverComp}</span>
            </div>
          )}
        </div>
      </div>
      {follow && <FollowCard s={s} unitId={follow} />}
      {PERF && <PerfReadout units={units.length} />}
      <div className="scene-tools" role="toolbar" aria-label="Canvas controls">
        <button className="icon-btn" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
          −
        </button>
        <button className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          +
        </button>
        <button
          className="icon-btn wide"
          onClick={() => {
            store.setFollow(null);
            setView({ k: 1, x: 0, y: 0 });
          }}
          aria-label="Fit line"
        >
          Fit
        </button>
      </div>
      <div className="scene-hint">{v.k > 1 ? 'Drag to pan' : '⌘ + scroll to zoom'} · Click a product to follow it</div>
    </div>
  );
}

function centerOf(id: StationId): [number, number] {
  const h = GEOMETRY[id].hull;
  let x = 0, y = 0;
  for (const p of h) {
    x += p[0];
    y += p[1];
  }
  return [x / h.length, y / h.length];
}

const pos = (x: number, y: number) => ({ left: `${(x / VIEW_W) * 100}%`, top: `${(y / VIEW_H) * 100}%` });

/** A number pill; on hover (or while alerting) it opens into a glass chip with name, state and cycle. */
function StationLabel({ s, id, at, active, sel, hover, onClick, onEnter, onLeave }: { s: Session; id: StationId; at: [number, number]; active: boolean; sel: boolean; hover: boolean; onClick: () => void; onEnter: () => void; onLeave: () => void }) {
  const meta = STATION_META[id];
  const v = stationView(s, id);
  const fault = s.faults.find((f) => f.station === id && isOpenFault(f));
  const alert = v.status === 'faulted' || v.status === 'maintenance';
  return (
    <button
      className={`st-label${active ? ' active' : ''}${sel ? ' sel' : ''}${hover ? ' hover' : ''}${alert ? ' alert' : ''}`}
      style={pos(at[0], at[1])}
      onClick={onClick}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      tabIndex={-1}
      aria-hidden
    >
      <span className="st-no">{meta.no}</span>
      <span className="st-more">
        <span className="st-name">{meta.short}</span>
        <span className={`st-state s-${v.status}`}>
          <StatusDot status={v.status} /> {fault ? FAULT_DEF[fault.code].title : statusLabel(v.status)}
        </span>
        {!alert && <span className="st-meta">{(v.avgCycle ?? s.config[id].cycleSeconds).toFixed(1)} s</span>}
      </span>
    </button>
  );
}

/** Glance card anchored to the focused station; the drawer holds everything else. */
function FocusCard({ s, id, k, onOpen }: { s: Session; id: StationId; k: number; onOpen: () => void }) {
  const meta = STATION_META[id];
  const v = stationView(s, id);
  const fault = s.faults.find((f) => f.station === id && isOpenFault(f));
  const h = GEOMETRY[id].hull;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  for (const p of h) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
  }
  const below = y0 / VIEW_H < 0.34;
  const at = below ? GEOMETRY[id].label : ([(x0 + x1) / 2, y0] as [number, number]);
  const style = {
    ...pos(at[0], at[1] + (below ? 34 : 0)),
    transform: `translate(-50%, ${below ? '0' : 'calc(-100% - 10px)'}) scale(${1 / k})`,
    transformOrigin: below ? '50% 0' : '50% 100%',
  };
  return (
    <div className={`focus-card${below ? ' below' : ''}`} style={style} role="dialog" aria-label={`${meta.name} summary`}>
      <div className="fc-h">
        <span className="st-no">{meta.no}</span>
        <b title={meta.name}>{meta.short}</b>
        <StatusPill status={v.status} />
      </div>
      {fault && <div className="fc-fault">{FAULT_DEF[fault.code].title}</div>}
      <div className="fc-stats">
        <div className="fc-stat">
          <b>{(v.avgCycle ?? s.config[id].cycleSeconds).toFixed(1)}s</b>
          <span>{v.avgCycle ? 'avg cycle' : 'cycle'}</span>
        </div>
        <div className="fc-stat">
          <b>
            {v.inQueue + v.incoming}/{v.inCap}
          </b>
          <span>in buffer</span>
        </div>
        <div className="fc-stat">
          <b>{v.utilization === null ? '—' : `${Math.round(v.utilization * 100)}%`}</b>
          <span>utilisation</span>
        </div>
      </div>
      <div className="fc-unit">
        <span className="mono">{v.currentUnit ?? 'No unit in machine'}</span>
        <button className="btn sm primary" onClick={onOpen}>
          Details
        </button>
      </div>
      {v.currentUnit && (
        <div className="progress" aria-label={`Cycle ${Math.round((v.progress ?? 0) * 100)}%`}>
          <i style={{ width: `${(v.progress ?? 0) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function PerfReadout({ units }: { units: number }) {
  const [nodes, setNodes] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNodes(document.querySelectorAll('.scene svg *').length), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = store.frameMs.slice(-120).filter((x) => x > 0 && x < 1000);
  const avg = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
  const p95 = ms.length ? [...ms].sort((a, b) => a - b)[Math.floor(ms.length * 0.95)] : 0;
  return (
    <div className="perf-readout mono" aria-hidden>
      {avg ? `${(1000 / avg).toFixed(0)} fps · avg ${avg.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms` : 'idle'} · {units} units · {nodes} svg nodes
    </div>
  );
}

function TransportDebug({ s, units }: { s: Session; units: UnitPose[] }) {
  const pts = (lane: (typeof LANES)[number]) => {
    const out: string[] = [];
    for (let d = 0; d <= lane.length + 1e-6; d += Math.max(2, lane.length / 24)) {
      const [x, y] = screenAt(lane.poseAt(d));
      out.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const [x, y] = screenAt(lane.to);
    out.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    return 'M' + out.join('L');
  };
  return (
    <g className="dbg">
      {LANES.map((l) => (
        <path key={l.id} d={pts(l)} className={`dbg-lane${l.id.includes('->') ? ' xfer' : ''}`} />
      ))}
      {STATION_IDS.map((id) => {
        const p = PORTS[id];
        const marks: [string, number][] = [
          ['in', p.in],
          ['work', p.work[0]],
          ['out', p.out],
        ];
        if (p.exitFrom !== p.work[0]) marks.push(['place', p.exitFrom]);
        return marks.map(([name, x]) => {
          const [sx, sy] = screenAt(lanePoint(x));
          return (
            <g key={`${id}:${name}`}>
              <circle cx={sx} cy={sy} r={2.2} className="dbg-port" />
              <text x={sx + 3} y={sy - 3} className="dbg-t">
                {id}.{name}
              </text>
            </g>
          );
        });
      })}
      {units.map((u) => {
        const [x, y] = screenAt(u.at);
        const tr = s.transfers.find((t) => t.unitId === u.id);
        return (
          <text key={u.id} x={x + 6} y={y - 10} className="dbg-t unit-id">
            {u.id}
            {tr ? ` ${tr.transferId}` : ''}
          </text>
        );
      })}
    </g>
  );
}

export function useReducedMotionSync() {
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}
