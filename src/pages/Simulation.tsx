import { useMemo } from 'react';
import { store } from '../app/store';
import { STATION_META } from '../domain/config';
import { SCENARIOS, explainComparison, runScenario, type RunResult } from '../domain/scenarios';
import { LineChart } from '../ui/Charts';
import { PageHead, pct } from '../ui/Page';
import { ToolLink } from '../workspace/links';
import { useConfirmReplace } from '../workspace/RestartDialog';
import { workspace } from '../workspace/workspaceStore';

const cache = new Map<string, ReturnType<typeof runScenario>>();
const run = (id: string) => {
  if (!cache.has(id)) cache.set(id, runScenario(SCENARIOS.find((s) => s.id === id)!));
  return cache.get(id)!;
};

export function SimulationPage() {
  const replace = useConfirmReplace();
  return (
    <div className="page">
      <PageHead crumbs="Scenario lab" title="Scenario lab" sub="Each scenario is a seeded, scripted run of the same engine. Results are reproducible: same seed and script, same numbers." />
      <div className="grid3">
        {SCENARIOS.map((sc) => (
          <div key={sc.id} className="card scenario">
            <span className="eyebrow">{sc.affected.map((a) => STATION_META[a].short).join(' · ') || 'Whole line'}</span>
            <h3>{sc.title}</h3>
            <p className="muted">{sc.goal}</p>
            <p style={{ fontSize: 12.5 }}>{sc.description}</p>
            <div className="row" style={{ marginTop: 'auto' }}>
              <ToolLink className="btn sm blue" tool="scenarios" item={sc.id}>
                Run and compare
              </ToolLink>
              <button className="btn sm" onClick={() => replace.ask(`Load “${sc.title}” on the line?`, 'Load scenario', () => store.loadScenario(sc.id))}>
                Load on line
              </button>
            </div>
          </div>
        ))}
      </div>
      {replace.dialog}
    </div>
  );
}

const ROWS: [keyof RunResult, string, (v: RunResult[keyof RunResult]) => string][] = [
  ['shipped', 'Good units dispatched', (v) => Number(v).toLocaleString()],
  ['rejected', 'Rejected at QA', (v) => String(v)],
  ['oee', 'OEE (packaging)', (v) => pct(v as number | null)],
  ['downtimeSec', 'Downtime (fault + repair)', (v) => `${Math.round(Number(v))} s`],
  ['avgWip', 'Average WIP', (v) => Number(v).toFixed(1)],
  ['energyKWh', 'Energy', (v) => `${Number(v).toFixed(1)} kWh`],
  ['whPerGood', 'Energy per good unit', (v) => (v === null ? '—' : `${Number(v).toFixed(1)} Wh`)],
  ['bottleneck', 'Busiest station', (v) => (v ? STATION_META[v as keyof typeof STATION_META].short : '—')],
  ['events', 'Events', (v) => Number(v).toLocaleString()],
];

export function ScenarioRunPage({ id }: { id: string }) {
  const replace = useConfirmReplace();
  const sc = SCENARIOS.find((s) => s.id === id);
  const data = useMemo(() => (sc ? { base: run('baseline'), variant: run(sc.id) } : null), [sc]);
  if (!sc || !data)
    return (
      <div className="page">
        <BackToScenarios />
        <div className="empty">Scenario {id} was not found.</div>
      </div>
    );
  const { base, variant } = data;
  const isBase = sc.id === 'baseline';
  const load = () => {
    store.loadScenario(sc.id);
    workspace.openTool(null);
  };
  return (
    <div className="page">
      <BackToScenarios />
      <PageHead
        crumbs="Scenario lab / Run"
        title={sc.title}
        sub={`Seed ${sc.seed} · horizon ${Math.round(sc.horizonSec / 60)} virtual min · run headless in the browser`}
        actions={
          <button
            className="btn primary"
            onClick={() => replace.ask(`Load “${sc.title}” on the line?`, 'Load and watch', load)}
          >
            Load on line and watch
          </button>
        }
      />
      <div className="grid2">
        <div className="card">
          <h3>What to expect</h3>
          <p style={{ marginTop: 0 }}>{sc.expectedSymptoms}</p>
          <h3>Recovery script</h3>
          <p style={{ marginTop: 0 }}>{sc.expectedActions}</p>
        </div>
        <div className="card">
          <h3>{isBase ? 'Result' : 'Compared with baseline'}</h3>
          <p style={{ marginTop: 0 }}>{isBase ? 'This is the reference run every other scenario is compared against.' : explainComparison(base.result, variant.result)}</p>
        </div>
      </div>
      <div className="card flush">
        <table className="tbl">
          <thead>
            <tr>
              <th>Metric</th>
              {!isBase && <th className="r">Baseline</th>}
              <th className="r">{isBase ? 'Baseline' : sc.title}</th>
              {!isBase && <th className="r">Δ</th>}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([k, label, f]) => {
              const a = base.result[k];
              const b = variant.result[k];
              const d = typeof a === 'number' && typeof b === 'number' ? b - a : null;
              return (
                <tr key={k}>
                  <td>{label}</td>
                  {!isBase && <td className="r num">{f(a)}</td>}
                  <td className="r num">{f(b)}</td>
                  {!isBase && <td className="r num muted">{d === null || Math.abs(d) < 1e-9 ? '—' : `${d > 0 ? '+' : ''}${k === 'oee' ? (d * 100).toFixed(1) + ' pt' : Math.abs(d) < 10 ? d.toFixed(1) : Math.round(d).toLocaleString()}`}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Throughput over the run (units/h)</h3>
        <LineChart
          series={[
            ...(isBase ? [] : [{ label: 'Baseline', cls: 'alt', points: base.session.samples.map((x) => [x.t / 60, x.throughput] as [number, number]) }]),
            { label: sc.title, points: variant.session.samples.map((x) => [x.t / 60, x.throughput] as [number, number]) },
          ]}
          xFmt={(v) => `${Math.round(v)} min`}
          height={170}
        />
      </div>
      {replace.dialog}
    </div>
  );
}

function BackToScenarios() {
  return (
    <ToolLink tool="scenarios" className="back-link">
      ← All scenarios
    </ToolLink>
  );
}
