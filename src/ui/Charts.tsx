import { useCallback, useRef, useState } from 'react';

/** Draw in CSS pixels so axis text keeps its size at any card width. */
export function useWidth(fallback: number) {
  const [w, setW] = useState(fallback);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => {
      const next = Math.round(e.contentRect.width);
      if (next > 0) setW(next);
    });
    ro.current.observe(el);
  }, []);
  return [ref, w] as const;
}

interface Series {
  points: [number, number][];
  cls?: string;
  area?: boolean;
  label: string;
}

const nice = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function LineChart({
  series,
  height = 140,
  width: fallbackWidth = 520,
  yFmt = (v) => String(Math.round(v)),
  xFmt = (v) => String(Math.round(v)),
  yMax,
  empty = 'No data in this window yet',
}: {
  series: Series[];
  height?: number;
  width?: number;
  yFmt?: (v: number) => string;
  xFmt?: (v: number) => string;
  yMax?: number;
  empty?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth(fallbackWidth);
  const all = series.flatMap((s) => s.points);
  if (all.length < 2)
    return (
      <div ref={ref} className="empty">
        {empty}
      </div>
    );
  const L = 38, R = 8, T = 8, B = 20;
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
  const ym = nice(yMax ?? Math.max(...all.map((p) => p[1])) * 1.08);
  const sx = (x: number) => L + ((x - x0) / Math.max(1e-9, x1 - x0)) * (width - L - R);
  const sy = (y: number) => T + (1 - y / ym) * (height - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ym);
  const hx = hover === null ? null : x0 + hover * (x1 - x0);
  return (
    <div ref={ref}>
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="chart"
      role="img"
      aria-label={series.map((s) => s.label).join(', ')}
      onPointerMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * width;
        setHover(Math.min(1, Math.max(0, (px - L) / (width - L - R))));
      }}
      onPointerLeave={() => setHover(null)}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={L} x2={width - R} y1={sy(t)} y2={sy(t)} />
          <text className="axis" x={L - 6} y={sy(t) + 3} textAnchor="end">
            {yFmt(t)}
          </text>
        </g>
      ))}
      <text className="axis" x={L} y={height - 4}>
        {xFmt(x0)}
      </text>
      <text className="axis" x={width - R} y={height - 4} textAnchor="end">
        {xFmt(x1)}
      </text>
      {series.map((s, i) => {
        const d = s.points.map((p, k) => `${k ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join('');
        return (
          <g key={i}>
            {s.area && s.points.length > 1 && <path className="area" d={`${d}L${sx(s.points[s.points.length - 1][0])} ${sy(0)}L${sx(s.points[0][0])} ${sy(0)}Z`} />}
            <path className={`line ${s.cls ?? ''}`} d={d} />
          </g>
        );
      })}
      {hx !== null && (
        <g>
          <line className="grid" x1={sx(hx)} x2={sx(hx)} y1={T} y2={height - B} />
          {series.map((s, i) => {
            const p = s.points.reduce((a, b) => (Math.abs(b[0] - hx) < Math.abs(a[0] - hx) ? b : a));
            return (
              <text key={i} className="axis" x={Math.min(width - 90, sx(hx) + 6)} y={T + 10 + i * 12}>
                {s.label}: {yFmt(p[1])} @ {xFmt(p[0])}
              </text>
            );
          })}
        </g>
      )}
    </svg>
    </div>
  );
}

export function BarChart({
  bars,
  height = 140,
  width: fallbackWidth = 520,
  yFmt = (v) => String(Math.round(v)),
  yMax,
  label,
}: {
  bars: { x: string; v: number; cls?: string; title?: string }[];
  height?: number;
  width?: number;
  yFmt?: (v: number) => string;
  yMax?: number;
  label: string;
}) {
  const [ref, width] = useWidth(fallbackWidth);
  if (!bars.length)
    return (
      <div ref={ref} className="empty">
        No data
      </div>
    );
  const step = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor((width - 42) / 44))));
  const L = 38, R = 4, T = 8, B = 20;
  const ym = yMax ?? nice(Math.max(...bars.map((b) => b.v)) * 1.08);
  const bw = (width - L - R) / bars.length;
  const sy = (y: number) => T + (1 - y / ym) * (height - T - B);
  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label={label}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line className="grid" x1={L} x2={width - R} y1={sy(f * ym)} y2={sy(f * ym)} />
          <text className="axis" x={L - 6} y={sy(f * ym) + 3} textAnchor="end">
            {yFmt(f * ym)}
          </text>
        </g>
      ))}
      {bars.map((b, i) => (
        <rect key={i} className={`bar ${b.cls ?? ''}`} x={L + i * bw + bw * 0.15} width={bw * 0.7} y={sy(b.v)} height={Math.max(0, sy(0) - sy(b.v))} rx={1.5}>
          <title>{b.title ?? `${b.x}: ${yFmt(b.v)}`}</title>
        </rect>
      ))}
      {bars.map((b, i) =>
        i % step === 0 ? (
          <text key={i} className="axis" x={L + i * bw + bw / 2} y={height - 5} textAnchor="middle">
            {b.x}
          </text>
        ) : null,
      )}
    </svg>
    </div>
  );
}
