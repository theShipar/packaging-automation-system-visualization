import { memo, type ReactNode } from 'react';
import type { Session } from '../domain/types';
import { casePoses, frameUnits, type UnitPose } from '../transport/poses';
import { depthKey, type Shape } from './builder';
import { CASE } from './figures';
import { CARTON_SHAPES, KIT_SHAPES, SEALED_CASE_SHAPES, openCaseShapes, screenAt } from './sceneModel';

export const Shapes = memo(function Shapes({ shapes }: { shapes: Shape[] }) {
  return (
    <>
      {shapes.map((s, i) =>
        s.t === 'path' ? <path key={i} d={s.d} className={s.cls} /> : <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} className={s.cls} />,
      )}
    </>
  );
});

export interface DepthItem {
  key: string;
  depth: number;
  node: ReactNode;
}

/**
 * One persistent node per unit (keyed by unitId) and per case (keyed by caseId), positioned
 * by transform only. Returned as depth items so the scene can interleave them with station
 * front groups.
 */
export function productItems(s: Session, follow: string | null): { units: UnitPose[]; items: DepthItem[] } {
  const units = frameUnits(s);
  const items: DepthItem[] = units.map((u) => ({ key: u.id, depth: u.key, node: <UnitNode key={u.id} u={u} followed={u.id === follow} /> }));
  for (const c of casePoses(s)) {
    const [x, y] = screenAt(c.at);
    if (c.open) {
      const parts = openCaseShapes(c.fill);
      items.push({ key: `${c.id}:b`, depth: depthKey(c.at[0] + CASE.L / 2, c.at[1] - CASE.W / 2, c.at[2]), node: <CaseNode key={`${c.id}:b`} x={x} y={y} shapes={parts.back} /> });
      items.push({ key: `${c.id}:f`, depth: depthKey(c.at[0] - CASE.L / 2, c.at[1] + CASE.W / 2, c.at[2]), node: <CaseNode key={`${c.id}:f`} x={x} y={y} shapes={parts.front} /> });
    } else items.push({ key: c.id, depth: depthKey(c.at[0], c.at[1], c.at[2]), node: <CaseNode key={c.id} x={x} y={y} shapes={SEALED_CASE_SHAPES} /> });
  }
  return { units, items };
}

const UnitNode = memo(
  function UnitNode({ u, followed }: { u: UnitPose; followed: boolean }) {
    const [x, y] = screenAt(u.at);
    return (
      <g className={`product${followed ? ' followed' : ''}`} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`} data-unit={u.id}>
        <Shapes shapes={u.kind === 'carton' ? CARTON_SHAPES : KIT_SHAPES} />
      </g>
    );
  },
  (a, b) => a.followed === b.followed && a.u.kind === b.u.kind && a.u.at[0] === b.u.at[0] && a.u.at[1] === b.u.at[1] && a.u.at[2] === b.u.at[2],
);

const CaseNode = memo(function CaseNode({ x, y, shapes }: { x: number; y: number; shapes: Shape[] }) {
  return (
    <g className="product case" transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
      <Shapes shapes={shapes} />
    </g>
  );
});
