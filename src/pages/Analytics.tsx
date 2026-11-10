import { useState } from 'react';
import { useUi } from '../app/store';
import { STATIONS } from '../domain/config';
import { buildHistory } from '../domain/history';
import { lineKpis } from '../domain/kpis';
import { LiveInsights } from '../features/LiveInsights';
import { BarChart, LineChart } from '../ui/Charts';
import { Kpi, PageHead, pct } from '../ui/Page';

export function AnalyticsPage() {
  const s = useUi();
  const h = buildHistory();
  const [range, setRange] = useState<14 | 30 | 90>(30);
  const days = h.days.slice(-range);
  const k = lineKpis(s);
  const shipped = days.reduce((a, d) => a + d.shipped, 0);
  const inspected = days.reduce((a, d) => a + d.inspected, 0);
  const rejected = days.reduce((a, d) => a + d.rejected, 0);
  const energy = days.reduce((a, d) => a + d.energyKWh, 0);
  const oeeDays = days.filter((d) => d.oee !== null);
  const avgOee = oeeDays.length ? oeeDays.reduce((a, d) => a + (d.oee ?? 0), 0) / oeeDays.length : null;
  const short = (iso: string) => iso.slice(5);

  return (
    <div className="page">
      <PageHead
        crumbs="Plant A / Line 01"
        title="Analytics"
        sub={`Daily history is aggregated from synthetic batches (seed ${h.seed}). Live charts read the current run's samples.`}
        actions={
          <div className="seg" role="radiogroup" aria-label="Range">
            {([14, 30, 90] as const).map((r) => (
              <button key={r} role="radio" aria-checked={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
                {r} d
              </button>
            ))}
          </div>
        }
      />
      <h2>Live run {s.runId}</h2>
      <LiveInsights s={s} />
      <h2>Daily history</h2>
      <div className="grid4">
        <Kpi t={`Shipped, ${range} d`} v={shipped.toLocaleString()} n={`${Math.round(shipped / Math.max(1, days.filter((d) => d.shipped).length)).toLocaleString()} per production day`} />
        <Kpi t="Average OEE" v={pct(avgOee)} n="days with production" />
        <Kpi t="First-pass yield" v={pct(inspected ? 1 - rejected / inspected : null)} n={`${rejected.toLocaleString()} rejects`} />
        <Kpi t="Energy intensity" v={shipped ? ((energy * 1000) / shipped).toFixed(1) : '—'} unit="Wh/unit" n={`${Math.round(energy).toLocaleString()} kWh total`} />
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Units shipped per day</h3>
          <BarChart label="Units shipped per day" bars={days.map((d) => ({ x: short(d.date), v: d.shipped, cls: d.maintenanceWindow ? 'muted' : '', title: `${d.date}: ${d.shipped}${d.maintenanceWindow ? ' (PM window)' : ''}` }))} />
        </div>
        <div className="card">
          <h3>OEE by day</h3>
          <LineChart
            series={[{ label: 'OEE', points: days.map((d, i) => [i, (d.oee ?? 0) * 100] as [number, number]).filter((_, i) => days[i].oee !== null) }]}
            yMax={100}
            yFmt={(v) => `${Math.round(v)}%`}
            xFmt={(i) => short(days[Math.round(i)]?.date ?? '')}
          />
        </div>
        <div className="card">
          <h3>Downtime minutes per day</h3>
          <BarChart label="Downtime per day" bars={days.map((d) => ({ x: short(d.date), v: d.downtimeMin, cls: 'warn' }))} />
        </div>
        <div className="card">
          <h3>Rejects per day</h3>
          <BarChart label="Rejects per day" bars={days.map((d) => ({ x: short(d.date), v: d.rejected, cls: 'crit' }))} />
        </div>
      </div>
      <h2>Live run samples</h2>
      <div className="grid2">
        <div className="card">
          <h3>Throughput and WIP</h3>
          <LineChart
            series={[
              { label: 'Throughput /h', points: s.samples.map((x) => [x.t / 60, x.throughput] as [number, number]) },
              { label: 'WIP', cls: 'alt', points: s.samples.map((x) => [x.t / 60, x.wip] as [number, number]) },
            ]}
            xFmt={(v) => `${Math.round(v)} min`}
            empty="Start the line to collect samples (every 30 virtual seconds)"
          />
        </div>
        <div className="card">
          <h3>Busy share per station (run)</h3>
          <BarChart
            label="Station utilization"
            yMax={100}
            yFmt={(v) => `${Math.round(v)}%`}
            bars={STATIONS.map((m) => {
              const st = s.stations[m.id];
              const total = Object.values(st.timeIn).reduce((a, b) => a + b, 0);
              return { x: m.short, v: total ? (st.timeIn.processing / total) * 100 : 0, cls: k.bottleneck === m.id ? 'hi' : '' };
            })}
          />
        </div>
      </div>
    </div>
  );
}
