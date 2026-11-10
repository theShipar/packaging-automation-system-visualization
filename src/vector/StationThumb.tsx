import { memo, useMemo } from 'react';
import { useFrame } from '../app/store';
import type { StationId } from '../domain/types';
import { CAM } from '../transport/layout';
import { machinePose } from '../transport/poses';
import { makeView, restPose, type MachinePose } from './builder';
import { FIGURES } from './figures';
import { bounds, cam, fit, proj } from './iso';
import { Shapes } from './ProductLayer';
import { drawStation } from './sceneModel';

const TW = 320;
const TH = 190;
const AZ = (CAM.az * 180) / Math.PI;

function useThumbView(id: StationId, fill: number) {
  return useMemo(() => {
    const ext = FIGURES[id].extent;
    const b = bounds(cam(AZ, CAM.k, 1), ext);
    const S = Math.min((TW * fill) / (b.x1 - b.x0), (TH * fill * 0.93) / (b.y1 - b.y0));
    const C = cam(AZ, CAM.k, S);
    fit(C, ext, TW / 2, TH / 2);
    return makeView(C, proj(C));
  }, [id, fill]);
}

function Drawing({ id, pose, hiComp, focus, fill }: { id: StationId; pose: MachinePose; hiComp: string | null; focus: boolean; fill: number }) {
  const view = useThumbView(id, fill);
  const d = drawStation(id, pose, hiComp, view);
  return (
    <svg viewBox={`0 0 ${TW} ${TH}`} className="hl thumb" aria-hidden>
      <g className={focus ? 'focus' : undefined}>
        <Shapes shapes={d.back} />
        {[...d.fronts]
          .sort((a, b) => a.key - b.key)
          .map((g) => (
            <Shapes key={g.name} shapes={g.shapes} />
          ))}
      </g>
    </svg>
  );
}

/** The same station geometry and camera direction, framed on its own for the inspector header. */
export function StationThumb({ id, hiComp, focus = false }: { id: StationId; hiComp: string | null; focus?: boolean }) {
  const s = useFrame();
  return <Drawing id={id} pose={machinePose(s, id, 0)} hiComp={hiComp} focus={focus} fill={0.9} />;
}

const REST = restPose();

/** A still, rest-pose thumbnail: drawn once, cheap enough for a row of cards. */
export const StationStill = memo(function StationStill({ id, focus = false }: { id: StationId; focus?: boolean }) {
  return <Drawing id={id} pose={REST} hiComp={null} focus={focus} fill={0.96} />;
});
