import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { store, useUi } from '../app/store';
import { FAULT_DEF, STATIONS, STATION_META } from '../domain/config';
import { isOpenFault } from '../domain/engine';
import { effectiveStatus, formatClock, lineKpis, unitCounts } from '../domain/kpis';
import { STATION_IDS, type Session, type StationId } from '../domain/types';
import { Inspector } from '../features/Inspector';
import { BarcodeChart, Chip, DotGrid, Ring } from '../ui/Kit';
import { MachineCard } from '../ui/MachineCard';
import { SimBadge } from '../ui/Status';
import { Scene } from '../vector/Scene';

const NOISE = new Set(['STATION_CYCLE_STARTED', 'STATION_CYCLE_COMPLETED', 'UNIT_RELEASED', 'MATERIAL_CONSUMED', 'QA_INSPECTION_PASSED', 'CASE_OPENED', 'TRANSFER_RESERVED', 'TRANSFER_STARTED', 'TRANSFER_COMPLETED']);
const BARS = 48;
const DOTS = 24;

export function ProductionPage() {
  const s = useUi();
  const [params, setParams] = useSearchParams();
  const selected = (params.get('station') as StationId | null) ?? null;
  const details = selected !== null && params.get('details') === '1';
  const [comp, setComp] = useState<string | null>(null);
  const update = (fn: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params);
    fn(p);
    setParams(p, { replace: true });
  };
  const select = (id: StationId | null) => {
    setComp(null);
    update((p) => {
      if (id) p.set('station', id);
      else {
        p.delete('station');
        p.delete('details');
      }
    });
  };
  const openDetails = (id: StationId | null = selected) =>
    id &&
    update((p) => {
      p.set('station', id);
      p.set('details', '1');
    });
  const critical = s.faults.filter((f) => isOpenFault(f) && f.severity === 'critical');

  return (
    <div className="prod">
      <Hero s={s} />
      {critical.map((f) => (
        <div key={f.id} className="crit-strip" role="alert">
          <span className="pip" />
          <span>
            {STATION_META[f.station].short} · {FAULT_DEF[f.code].title} <span className="mono">{f.code}</span>
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => openDetails(f.station)}>
            Open incident
          </button>
        </div>
      ))}
      {s.awaitingPartialApproval && (
        <div className="crit-strip info">
          <span>Line has run down. The final case holds {s.cases.find((c) => c.id === s.openCaseId)?.unitIds.length ?? 0} kits.</span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => store.command({ kind: 'CLOSE_PARTIAL_CASE' })}>
            Approve partial case
          </button>
        </div>
      )}
      {s.status === 'completed' && (
        <div className="crit-strip info">
          <span>
            Batch {s.batch.id} {s.batch.status}.
          </span>
          <span className="spacer" />
          <Link className="btn sm" to={`/production/batches/${s.batch.id}`}>
            Open reconciliation
          </Link>
        </div>
      )}
      <div className="stage">
        <div className="stage-top">
          <Chip tone="glass" sm k="Line 01" n={s.batch.skuName} />
          {s.status === 'ready' && <Chip tone="glass" sm k="Press play to release" n={`${s.config.intake.feedReleaseSize} units per wave`} />}
          <span className="spacer" />
          <LatestEvent s={s} onSelect={select} />
        </div>
        <Scene selected={selected} selectedComp={comp} onSelect={select} onSelectComp={setComp} onOpen={() => openDetails()} showCard={!details} />
      </div>
      <section className="mstrip" aria-label="Stations">
        {STATIONS.map((m) => (
          <MachineCard key={m.id} s={s} id={m.id} active={selected === m.id} onSelect={select} />
        ))}
      </section>
      <section className="insights" aria-label="Line insights">
        <ThroughputInsight s={s} />
        <QualityInsight s={s} />
        <RhythmInsight s={s} />
      </section>
      {details && selected && <Inspector id={selected} comp={comp} onComp={setComp} onClose={() => update((p) => p.delete('details'))} />}
    </div>
  );
}

function Hero({ s }: { s: Session }) {
  const c = unitCounts(s);
  const k = lineKpis(s);
  const pct = (v: number) => `${(v / Math.max(1, c.planned)) * 100}%`;
  return (
    <section className="hero">
      <div className="hero-title">
        <div className="crumbs">Plant A · Line 01 · Production</div>
        <h1 className="display">Packaging Line</h1>
        <div className="row wrap">
          <Chip data-test="batch" tone="dark" k="Batch" n={<Link to={`/production/batches/${s.batch.id}`} style={{ color: 'inherit' }}>{s.batch.id}</Link>} />
          <Chip k="SKU" n={s.batch.sku} />
          <Chip k="Planned" n={s.batch.planned.toLocaleString()} className="opt" title="Units planned as input; committed good is the shipping target" />
          <SimBadge />
        </div>
      </div>
      <div className="hero-progress">
        <div className="hero-big" title="Good units shipped against the committed quantity">
          {k.shipped.toLocaleString()}
          <span className="unit">/ {s.batch.committedGood.toLocaleString()} shipped</span>
        </div>
        <div className="meter" role="img" aria-label={`Planned ${c.planned}: dispatched ${c.dispatched}, WIP ${c.wip}, rejected ${c.rejected}, unreleased ${c.unreleased}`} title={`Dispatched ${c.dispatched.toLocaleString()} · WIP ${c.wip.toLocaleString()} · Rejected ${c.rejected.toLocaleString()} · Unreleased ${c.unreleased.toLocaleString()}`}>
          <i className="m-ship" style={{ width: pct(c.dispatched) }} />
          <i className="m-wip" style={{ width: pct(c.wip) }} />
          <i className="m-rej" style={{ width: pct(c.rejected) }} />
        </div>
        <div className="hero-cap" title={k.eta.basis}>
          <b>{k.eta.label}</b> · {k.remainingGood.toLocaleString()} good to go · {c.wip.toLocaleString()} in WIP · {c.rejected.toLocaleString()} rejected
        </div>
      </div>
    </section>
  );
}

function LatestEvent({ s, onSelect }: { s: Session; onSelect: (id: StationId) => void }) {
  let e = null;
  for (let i = s.events.length - 1; i >= 0; i--)
    if (!NOISE.has(s.events[i].type)) {
      e = s.events[i];
      break;
    }
  if (!e) return null;
  const station = e.stationId;
  return (
    <Chip tone="glass" sm className="latest" onClick={station ? () => onSelect(station) : undefined} title={`${e.message} — all events are in the Events page`} style={{ maxWidth: 420 }}>
      <span className={`sev ${e.severity}`} style={{ margin: 0 }} />
      <span className="k num">{formatClock(e.virtualAt)}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.message}</span>
    </Chip>
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
        <div className="ins-big">
          {Math.round(k.throughputHr)}
          <span className="unit">/h</span>
        </div>
      </div>
      <BarcodeChart bars={bars} slots={BARS} limit={limit} limitLabel="Max limit" axis={span ? [`${span} min ago`, 'now'] : undefined} empty="Bars appear every 30 virtual seconds once the line runs" />
      <div className="ins-foot">
        <Chip sm k="OEE" n={k.oee ? `${(k.oee.oee * 100).toFixed(1)}%` : '—'} title={k.oee ? `Availability ${(k.oee.a * 100).toFixed(0)}% · Performance ${(k.oee.p * 100).toFixed(0)}% · Quality ${(k.oee.q * 100).toFixed(0)}%` : 'Needs 2 min of runtime'} />
        <Chip sm k="Energy" n={`${k.energyKWh.toFixed(1)} kWh`} title={k.whPerGood ? `${k.whPerGood.toFixed(1)} Wh per good unit` : 'Energy across all six stations'} />
        <Chip sm k="Bottleneck" n={k.bottleneck ? STATION_META[k.bottleneck].short : '—'} title="Busiest station over the run" />
      </div>
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
        <Chip sm tone={rejected ? 'soft' : 'default'} k="Reject tray" n={s.rejectTray.length} />
      </div>
      <div className="qrow">
        <Ring value={k.yieldPct} size={112} stroke={9} tone="orange" lg label={k.yieldPct === null ? '—' : `${(k.yieldPct * 100).toFixed(1)}%`} title={k.yieldPct === null ? 'Yield appears after the first inspection' : `QA yield ${(k.yieldPct * 100).toFixed(1)}%`} />
        <div className="qstats">
          <div className="mstat">
            <b>{k.inspected.toLocaleString()}</b>
            <span>inspected</span>
          </div>
          <div className="mstat">
            <b>{rejected.toLocaleString()}</b>
            <span>rejected</span>
          </div>
          <div className="mstat">
            <b>
              {s.qaRule.weightMin}–{s.qaRule.weightMax}
              <small>g</small>
            </b>
            <span>weight band</span>
          </div>
          <div className="mstat">
            <b>≤ {s.qaRule.visualMax}</b>
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
    <div className="card insight orange">
      <div className="ins-h">
        <div>
          <div className="ins-t">Line rhythm</div>
          <div className="ins-s">Station state every 30 s · last {Math.round((recent.length * 30) / 60)} min</div>
        </div>
        <div className="ins-big">
          {running}
          <span className="unit" style={{ color: 'rgba(255,255,255,.75)' }}>
            /6 running
          </span>
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
