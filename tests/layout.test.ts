import { describe, expect, it } from 'vitest';
import { STATION_IDS, type StationId } from '../src/domain/types';
import { BRIDGE, IN_LANE, LANES, OUT_LANE, TRANSFER_LANE } from '../src/transport/graph';
import { BELT_HALF, BRIDGE_X, CONNECTOR_GAP, CONNECTORS, GP, PLACE, ROW_OF, ROW_Y, toWorld } from '../src/transport/layout';
import { FIGURES } from '../src/vector/figures';
import { CONTENT_BOUNDS, FLOW_MARKS, GEOMETRY } from '../src/vector/sceneModel';

/** World xy footprint of a station from its figure extents. */
function footprint(id: StationId) {
  const pts = FIGURES[id].extent.map((p) => toWorld(id, p));
  return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
}
const overlaps = (a: ReturnType<typeof footprint>, b: ReturnType<typeof footprint>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('two-row layout', () => {
  it('LAY-001 row 1 flows +x on y = 0, row 2 flows −x on its own line, in station order', () => {
    expect(STATION_IDS.map((id) => ROW_OF[id])).toEqual([0, 0, 0, 1, 1, 1]);
    for (const id of STATION_IDS) {
      const row = ROW_OF[id];
      const lane = IN_LANE[id];
      if (id !== 'qa') {
        expect(lane.from[1]).toBeCloseTo(ROW_Y[row], 9);
        expect(lane.to[1]).toBeCloseTo(ROW_Y[row], 9);
        expect(Math.sign(lane.to[0] - lane.from[0])).toBe(row === 0 ? 1 : -1);
      }
      expect(PLACE[id].mirror).toBe(row === 1);
    }
    const workX = STATION_IDS.map((id) => IN_LANE[id].to[0]);
    expect(workX[0] < workX[1] && workX[1] < workX[2]).toBe(true);
    expect(workX[3] > workX[4] && workX[4] > workX[5]).toBe(true);
  });

  it('LAY-002 the route is continuous end to end, including the U-turn', () => {
    const chain = STATION_IDS.slice(0, -1).flatMap((id) => [OUT_LANE[id], TRANSFER_LANE[id]]);
    for (let i = 0; i < chain.length - 1; i += 2) expect(Math.hypot(chain[i].to[0] - chain[i + 1].from[0], chain[i].to[1] - chain[i + 1].from[1])).toBeLessThan(1e-9);
    /* the bridge column stands beyond both row ends and spans both row lines */
    const ends = STATION_IDS.map((id) => footprint(id).x1);
    expect(BRIDGE_X - BELT_HALF).toBeGreaterThan(Math.max(...ends));
    const ys = [];
    for (let d = 0; d <= BRIDGE.length; d += 2) ys.push(BRIDGE.poseAt(d)[1]);
    expect(Math.min(...ys)).toBeCloseTo(ROW_Y[0], 6);
    expect(Math.max(...ys)).toBeCloseTo(ROW_Y[1], 6);
  });

  it('LAY-003 no two machines share floor space and the rows keep an aisle', () => {
    for (let i = 0; i < STATION_IDS.length; i++)
      for (let j = i + 1; j < STATION_IDS.length; j++) expect(overlaps(footprint(STATION_IDS[i]), footprint(STATION_IDS[j])), `${STATION_IDS[i]}/${STATION_IDS[j]}`).toBe(false);
    const row1 = Math.max(...STATION_IDS.filter((id) => ROW_OF[id] === 0).map((id) => footprint(id).y1));
    const row2 = Math.min(...STATION_IDS.filter((id) => ROW_OF[id] === 1).map((id) => footprint(id).y0));
    expect(row2 - row1).toBeGreaterThan(30);
    /* connectors sit on their own row line */
    for (const c of CONNECTORS) expect(ROW_OF[c.from]).toBe(ROW_OF[c.to]);
  });

  it('LAY-004 Fit bounds contain all six machines, every lane, the bridge and the exit', () => {
    const inside = (x: number, y: number) => x >= CONTENT_BOUNDS.minX - 1e-6 && x <= CONTENT_BOUNDS.maxX + 1e-6 && y >= CONTENT_BOUNDS.minY - 1e-6 && y <= CONTENT_BOUNDS.maxY + 1e-6;
    for (const id of STATION_IDS) {
      const b = GEOMETRY[id].bounds;
      expect(inside(b.minX, b.minY) && inside(b.maxX, b.maxY), id).toBe(true);
    }
    for (const l of LANES)
      for (let k = 0; k <= 10; k++) {
        const p = l.poseAt((l.length * k) / 10);
        const [x, y] = GP(p[0], p[1], p[2]);
        expect(inside(x, y), l.id).toBe(true);
      }
    expect(inside(...FLOW_MARKS.entry)).toBe(true);
    expect(inside(...FLOW_MARKS.exit)).toBe(true);
  });

  it('LAY-005 the cell is compact: landscape, and much shorter than a single line', () => {
    const w = CONTENT_BOUNDS.maxX - CONTENT_BOUNDS.minX, h = CONTENT_BOUNDS.maxY - CONTENT_BOUNDS.minY;
    expect(w / h).toBeGreaterThan(1.3);
    expect(w / h).toBeLessThan(2.2);
    const routeLen = STATION_IDS.reduce((n, id) => n + FIGURES[id].xExit - FIGURES[id].xEntry, 0) + (STATION_IDS.length - 1) * CONNECTOR_GAP;
    /* a single diagonal line projects to about 0.71 × route length wide; the cell needs at most 65% of that */
    expect(w).toBeLessThan(0.71 * routeLen * 0.65);
  });
});
