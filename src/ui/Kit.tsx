import type { HTMLAttributes, ReactNode } from 'react';
import type { StationStatus } from '../domain/types';
import { useWidth } from './Charts';

type Tone = 'default' | 'dark' | 'orange' | 'red' | 'yellow' | 'soft' | 'glass';

export function Chip({
  tone = 'default',
  k,
  n,
  pip,
  live,
  sm,
  className = '',
  onClick,
  title,
  children,
  ...rest
}: {
  tone?: Tone;
  k?: ReactNode;
  n?: ReactNode;
  pip?: boolean;
  live?: boolean;
  sm?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'onClick'>) {
  const cls = `chip${tone === 'default' ? '' : ` ${tone}`}${sm ? ' sm' : ''}${live ? ' live' : ''} ${className}`.trim();
  const body = (
    <>
      {pip && <span className="pip" aria-hidden />}
      {k !== undefined && <span className="k">{k}</span>}
      {n !== undefined && <span className="n">{n}</span>}
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={title} {...rest}>
      {body}
    </button>
  ) : (
    <span className={cls} title={title} {...rest}>
      {body}
    </span>
  );
}

export function GlassCard({ className = '', children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card glass ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

/** Circular gauge for a 0..1 value; null renders an empty track. */
export function Ring({ value, size = 40, stroke = 4, tone, label, lg, title }: { value: number | null; size?: number; stroke?: number; tone?: 'orange' | 'red'; label?: ReactNode; lg?: boolean; title?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className={`ring${tone ? ` ${tone}` : ''}${lg ? ' lg' : ''}`} style={{ width: size, height: size }} title={title} role="img" aria-label={title ?? (value === null ? 'No data' : `${Math.round(v * 100)}%`)}>
      <svg width={size} height={size}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        {value !== null && <circle className="val" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} />}
      </svg>
      <span className="ring-l">{label ?? (value === null ? '—' : Math.round(v * 100))}</span>
    </span>
  );
}

/**
 * Dense bar strip with a dashed limit line. Bars flagged `on` take the accent colour.
 * Values above `limit` are drawn to the top so the line stays the visual reference.
 */
export function BarcodeChart({
  bars,
  limit,
  limitLabel = 'Max limit',
  height = 104,
  empty = 'No data yet',
  axis,
  slots,
}: {
  bars: { v: number; on?: boolean; title?: string }[];
  limit: number;
  limitLabel?: string;
  height?: number;
  empty?: string;
  axis?: [string, string];
  /** Fixed slot count; bars fill from the right so their width stays constant. */
  slots?: number;
}) {
  const [ref, w] = useWidth(360);
  if (!bars.length) return <div className="barcode-empty">{empty}</div>;
  const top = 14;
  const bottom = axis ? 16 : 2;
  const max = Math.max(limit * 1.12, ...bars.map((b) => b.v));
  const h = height - top - bottom;
  const y = (v: number) => top + h - (Math.min(v, max) / max) * h;
  const n = Math.max(bars.length, slots ?? 0);
  const gap = n > 40 ? 2 : 3;
  const bw = Math.max(1.5, (w - gap * (n - 1)) / n);
  const x0 = (n - bars.length) * (bw + gap);
  const ly = y(limit);
  return (
    <div ref={ref}>
      <svg className="barcode" width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`${bars.length} bars against a ${limitLabel.toLowerCase()} of ${limit}`}>
        {bars.map((b, i) => {
          const by = y(b.v);
          return (
            <rect key={i} className={`b${b.on ? ' on' : ''}`} x={x0 + i * (bw + gap)} y={by} width={bw} height={Math.max(1.5, top + h - by)} rx={Math.min(1.5, bw / 2)}>
              {b.title && <title>{b.title}</title>}
            </rect>
          );
        })}
        <line className="lim" x1={0} x2={w} y1={ly} y2={ly} />
        <text className="lim-t" x={w} y={ly - 4} textAnchor="end">
          {limitLabel} · {limit}
        </text>
        {axis && (
          <>
            <text className="ax" x={x0} y={height - 2}>
              {axis[0]}
            </text>
            <text className="ax" x={w} y={height - 2} textAnchor="end">
              {axis[1]}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

/** Rows of status dots over time, one row per station. */
export function DotGrid({ rows, cols }: { rows: { label: string; title: string; cells: (StationStatus | null)[] }[]; cols: number }) {
  return (
    <div className="dotgrid" role="img" aria-label="Station status over the last samples">
      {rows.map((r) => (
        <div key={r.label} className="dg-row" title={r.title}>
          <span>{r.label}</span>
          <div className="dg-cells" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {r.cells.map((c, i) => (
              <i key={i} className={`dg ${c ?? 'none'}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
