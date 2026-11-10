import { memo, useMemo, useState } from 'react';
import { useFrame } from '../app/store';
import { COMPONENTS } from '../domain/config';
import type { StationId } from '../domain/types';
import { CAM, PLACE } from '../transport/layout';
import { machinePose } from '../transport/poses';
import { makeView, restPose, type MachinePose } from './builder';
import { FIGURES } from './figures';
import { bounds, cam, fit, hull, poly, proj, type Pt, type V3 } from './iso';
import { Shapes } from './ProductLayer';
import { drawStation } from './sceneModel';

const TW = 320;
const TH = 190;
const AZ = (CAM.az * 180) / Math.PI;
const COMP_NAME = Object.fromEntries(COMPONENTS.map((c) => [c.id, c.name])) as Record<string, string>;
const area = (h: Pt[]) => Math.abs(h.reduce((a, p, i) => { const q = h[(i + 1) % h.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/** Same handedness as on the line: row 2 machines are drawn mirrored. */
function useThumbView(id: StationId, fill: number) {
  return useMemo(() => {
    const mirror = PLACE[id].mirror;
    const flip = (p: V3): V3 => (mirror ? [-p[0], p[1], p[2]] : p);
    const ext = FIGURES[id].extent.map(flip);
    const b = bounds(cam(AZ, CAM.k, 1), ext);
    const S = Math.min((TW * fill) / (b.x1 - b.x0), (TH * fill * 0.93) / (b.y1 - b.y0));
    const C = cam(AZ, CAM.k, S);
    fit(C, ext, TW / 2, TH / 2);
    const P = proj(C);
    return makeView(C, (x, y, z) => P(mirror ? -x : x, y, z), flip, mirror);
  }, [id, fill]);
}

function Drawing({ id, pose, hiComp, focus, fill, onPart }: { id: StationId; pose: MachinePose; hiComp: string | null; focus: boolean; fill: number; onPart?: (comp: string) => void }) {
  const view = useThumbView(id, fill);
  const [hover, setHover] = useState<string | null>(null);
  const d = drawStation(id, pose, hover ?? hiComp, view);
  // Largest first so small parts sit on top and stay clickable.
  const hits = onPart
    ? Object.entries(d.compPts)
        .map(([c, pts]) => ({ c, h: hull(pts) }))
        .filter((x) => x.h.length > 2)
        .sort((a, b) => area(b.h) - area(a.h))
    : [];
  return (
    <svg viewBox={`0 0 ${TW} ${TH}`} className="hl thumb" aria-hidden={!onPart} role={onPart ? 'group' : undefined} aria-label={onPart ? 'Machine parts' : undefined}>
      <g className={focus ? 'focus' : undefined}>
        <Shapes shapes={d.back} />
        {[...d.fronts]
          .sort((a, b) => a.key - b.key)
          .map((g) => (
            <Shapes key={g.name} shapes={g.shapes} />
          ))}
      </g>
      {hits.map(({ c, h }) => (
        <path
          key={c}
          d={poly(h)}
          className="thumb-hit"
          data-comp={c}
          role="button"
          aria-label={`${COMP_NAME[c] ?? c} (${c})`}
          onPointerEnter={() => setHover(c)}
          onPointerLeave={() => setHover((x) => (x === c ? null : x))}
          onClick={() => onPart?.(c)}
        >
          <title>{COMP_NAME[c] ?? c}</title>
        </path>
      ))}
    </svg>
  );
}

/** The same station geometry and camera direction, framed on its own for the inspector header. Pass onPart to make parts clickable. */
export function StationThumb({ id, hiComp, focus = false, onPart }: { id: StationId; hiComp: string | null; focus?: boolean; onPart?: (comp: string) => void }) {
  const s = useFrame();
  return <Drawing id={id} pose={machinePose(s, id, 0)} hiComp={hiComp} focus={focus} fill={0.9} onPart={onPart} />;
}

const REST = restPose();

/** A still, rest-pose thumbnail: drawn once, cheap enough for a row of cards. */
export const StationStill = memo(function StationStill({ id, focus = false }: { id: StationId; focus?: boolean }) {
  return <Drawing id={id} pose={REST} hiComp={null} focus={focus} fill={0.96} />;
});
