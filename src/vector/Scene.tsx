import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { store, useFrame } from '../app/store';
import { focusComponent, focusStation } from '../camera/commands';
import { camera } from '../camera/controller';
import { useCameraInput } from '../camera/useCameraInput';
import { COMPONENTS, STATION_META } from '../domain/config';
import { unitOf } from '../domain/core';
import { isOpenFault } from '../domain/engine';
import { effectiveStatus } from '../domain/kpis';
import { STATION_IDS, type Session, type StationId } from '../domain/types';
import { FollowCard } from '../features/follow-product/FollowCard';
import { LANES } from '../transport/graph';
import { PORTS, lanePoint } from '../transport/layout';
import { describeUnit, frameUnits, machinePose, type UnitPose } from '../transport/poses';
import { queueBadges } from '../transport/queueLayout';
import { statusLabel } from '../ui/Status';
import { type MachinePose } from './builder';
import { setReducedMotion } from './iso';
import { SceneOverlay } from './SceneOverlay';
import { Shapes, productItems } from './ProductLayer';
import { CONNECTOR_SHAPES, GEOMETRY, drawStation, screenAt, type StationDrawing } from './sceneModel';

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
}

export function Scene({ selected, selectedComp, onSelect, onSelectComp }: Props) {
  const s = useFrame();
  const [hoverStation, setHoverStation] = useState<StationId | null>(null);
  const [hoverComp, setHoverComp] = useState<string | null>(null);
  const cache = useRef(new Map<StationId, { key: string; d: StationDrawing }>());
  const root = useRef<HTMLDivElement>(null);
  const world = useRef<SVGGElement>(null);
  const follow = store.follow;

  useCameraInput(root, () => {
    onSelect(null);
    onSelectComp(null);
  });

  /* the camera writes the world transform directly; React never re-renders for a camera frame */
  useLayoutEffect(() => {
    const apply = () => {
      const { s: k, tx, ty } = camera.cam;
      world.current?.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})`);
    };
    apply();
    return camera.subscribe(apply);
  }, []);

  useEffect(() => {
    camera.followPoint = (id) => {
      const ss = store.session;
      const pose = frameUnits(ss).find((p) => p.id === id);
      if (pose) return screenAt(pose.at);
      const u = ss.units.find((x) => x.id === id);
      const st = u ? describeUnit(ss, u).station : null;
      return st ? centerOf(st) : null;
    };
  }, []);

  useEffect(() => {
    if (follow && (camera.mode !== 'follow-unit' || camera.targetId !== follow)) camera.startFollow(follow);
    if (!follow && camera.mode === 'follow-unit') camera.stopFollow();
  }, [follow]);

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

  return (
    <div ref={root} className={`scene${follow ? ' following' : ''}${hoverStation ? ' has-hover' : ''}${selected ? ' has-focus' : ''}`}>
      <svg className="hl" width="100%" height="100%" role="group" aria-label="Packaging line, six stations from intake to dispatch">
        <g ref={world}>
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
                  onDoubleClick={() => focusStation(id)}
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
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    focusComponent(selected, comp);
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
        </g>
      </svg>
      <SceneOverlay s={s} selected={selected} hover={hoverStation} hoverComp={hoverComp} badges={badges} onSelect={(id) => onSelect(id)} onHover={setHoverStation} />
      {follow && <FollowCard s={s} unitId={follow} />}
      {PERF && <PerfReadout units={units.length} />}
    </div>
  );
}

function centerOf(id: StationId): [number, number] {
  const b = GEOMETRY[id].bounds;
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
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
    const apply = () => {
      setReducedMotion(mq.matches);
      camera.reduced = mq.matches;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}
