import { STATIONS, STATION_META } from '../domain/config';
import { effectiveStatus, formatClock, lineKpis } from '../domain/kpis';
import { STATION_IDS, type Session } from '../domain/types';
import { BarcodeChart, DotGrid, Ring } from '../ui/Kit';

const BARS = 48;
const DOTS = 24;

/** Live-run panels for the Analytics drawer; the canvas itself carries no chart cards. */
export function LiveInsights({ s }: { s: Session }) {
  return (
    <div className="insights">
      <ThroughputInsight s={s} />
      <QualityInsight s={s} />
      <RhythmInsight s={s} />
    </div>
  );
}

function ThroughputInsight({ s }: { s: Session }) {
  const k = lineKpis(s);
  const limit = Math.round(3600 / Math.max(...STATION_IDS.map((id) => s.config[id].cycleSeconds)));
  const recent = s.samples.slice(-BARS);
  const since = s.t - k.throughputWindowSec;
  const bars = recent.map((x) => ({ v: x.throughput, on: x.t > since, title: `${formatClock(x.t)} · ${x.throughput}/h` }));
  const span = recent.length > 1 ? Math.round((recent[recent.length - 1].t - recent[0].t) / 60) : 0;
  return (
    <div className="card insight">
      <div className="ins-h">
        <div>
          <div className="ins-t">Throughput</div>
          <div className="ins-s">Good units per hour · rolling {Math.max(1, Math.round(k.throughputWindowSec / 60))} min</div>
        </div>
        <div className="ins-big num">
          {Math.round(k.throughputHr)}
          <span className="unit">/h</span>
        </div>
      </div>
      <BarcodeChart bars={bars} slots={BARS} limit={limit} limitLabel="Slowest-station limit" axis={span ? [`${span} min ago`, 'now'] : undefined} empty="Bars appear every 30 virtual seconds once the line runs" />
      <dl className="ins-foot">
        <div title={k.oee ? `Availability ${(k.oee.a * 100).toFixed(0)}% · Performance ${(k.oee.p * 100).toFixed(0)}% · Quality ${(k.oee.q * 100).toFixed(0)}%` : 'Needs 2 min of runtime'}>
          <dt>OEE (packaging)</dt>
          <dd className="num">{k.oee ? `${(k.oee.oee * 100).toFixed(1)}%` : '—'}</dd>
        </div>
        <div title={k.whPerGood ? `${k.whPerGood.toFixed(1)} Wh per good unit (simulated)` : 'Simulated energy across all six stations'}>
          <dt>Energy (sim)</dt>
          <dd className="num">{k.energyKWh.toFixed(1)} kWh</dd>
        </div>
        <div title="Highest busy share over the run">
          <dt>Constraint</dt>
          <dd>{k.bottleneck ? STATION_META[k.bottleneck].short : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

function QualityInsight({ s }: { s: Session }) {
  const k = lineKpis(s);
  const rejected = s.inspections.filter((i) => i.result === 'reject').length;
  return (
    <div className="card insight">
      <div className="ins-h">
        <div>
          <div className="ins-t">Quality</div>
          <div className="ins-s">QA yield · rule set {s.qaRule.version}</div>
        </div>
        <span className="tag">Reject tray {s.rejectTray.length}</span>
      </div>
      <div className="qrow">
        <Ring value={k.yieldPct} size={96} stroke={8} lg label={k.yieldPct === null ? '—' : `${(k.yieldPct * 100).toFixed(1)}%`} title={k.yieldPct === null ? 'Yield appears after the first inspection' : `QA yield ${(k.yieldPct * 100).toFixed(1)}%`} />
        <div className="qstats">
          <div className="mstat">
            <b className="num">{k.inspected.toLocaleString()}</b>
            <span>inspected</span>
          </div>
          <div className="mstat">
            <b className="num">{rejected.toLocaleString()}</b>
            <span>rejected</span>
          </div>
          <div className="mstat">
            <b className="num">
              {s.qaRule.weightMin}–{s.qaRule.weightMax}
              <small>g</small>
            </b>
            <span>weight band</span>
          </div>
          <div className="mstat">
            <b className="num">≤ {s.qaRule.visualMax}</b>
            <span>visual score</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RhythmInsight({ s }: { s: Session }) {
  const recent = s.samples.slice(-DOTS);
  const pad = DOTS - recent.length;
  const running = STATION_IDS.filter((id) => effectiveStatus(s, id) === 'processing').length;
  const rows = STATIONS.map((m) => ({
    label: m.no,
    title: m.name,
    cells: [...Array<null>(pad).fill(null), ...recent.map((x) => x.statuses[m.id])],
  }));
  return (
    <div className="card insight">
      <div className="ins-h">
        <div>
          <div className="ins-t">Flow rhythm</div>
          <div className="ins-s">Station state every 30 s · last {Math.round((recent.length * 30) / 60)} min</div>
        </div>
        <div className="ins-big num">
          {running}
          <span className="unit">/6 running</span>
        </div>
      </div>
      <DotGrid rows={rows} cols={DOTS} />
      <div className="dg-legend">
        <span>
          <i className="dg processing" /> Running
        </span>
        <span>
          <i className="dg starved" /> Waiting
        </span>
        <span>
          <i className="dg blocked" /> Blocked
        </span>
        <span>
          <i className="dg faulted" /> Fault / repair
        </span>
      </div>
    </div>
  );
}
