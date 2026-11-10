import { useState } from 'react';
import { clearSession } from '../app/persist';
import { store, useUi } from '../app/store';
import { ENGINE_VERSION, PERMISSIONS, ROLE_LABEL } from '../domain/config';
import type { Role } from '../domain/types';
import { PageHead } from '../ui/Page';

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export function SettingsPage() {
  const s = useUi();
  const [seed, setSeed] = useState(String(s.seed));
  return (
    <div className="page">
      <PageHead crumbs="Operations" title="Settings" sub="Workspace preferences for this browser. Station parameters live in each station's inspector." />
      <div className="grid2">
        <div className="card">
          <h3>Role (demo)</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Switch roles to see permission gating. There is no authentication — this is a local demo.
          </p>
          <div className="seg wrap" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <button key={r} role="radio" aria-checked={store.role === r} className={store.role === r ? 'on' : ''} onClick={() => store.setRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <dl className="dl" style={{ marginTop: 12 }}>
            {Object.entries(PERMISSIONS).map(([k, roles]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt className="mono">{k}</dt>
                <dd>{roles.includes(store.role) ? <span className="tag good">allowed</span> : <span className="tag">no</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="card">
          <h3>Run</h3>
          <dl className="dl">
            <dt>Engine</dt>
            <dd className="mono">{ENGINE_VERSION}</dd>
            <dt>Run</dt>
            <dd className="mono">{s.runId}</dd>
            <dt>Scenario</dt>
            <dd>{s.scenarioId}</dd>
            <dt>Seed</dt>
            <dd>{s.seed}</dd>
            <dt>Settings version</dt>
            <dd>v{s.configVersion}</dd>
            <dt>Saved</dt>
            <dd>{store.savedAt ? new Date(store.savedAt).toLocaleString() : 'not yet'}</dd>
          </dl>
          <div className="row wrap" style={{ marginTop: 12 }}>
            <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} aria-label="Seed" style={{ width: 90 }} />
            <button className="btn" onClick={() => store.reset({ seed: Number(seed) || 842 })}>
              New run with seed
            </button>
            <button className="btn" onClick={() => store.reset()}>
              Reset to defaults
            </button>
            <button
              className="btn"
              onClick={async () => {
                await clearSession();
                localStorage.removeItem('lf.role');
                store.toast('Saved data cleared from this browser', 'success');
              }}
            >
              Clear saved data
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>About this demo</h3>
        <p className="muted" style={{ margin: 0 }}>
          LineFlow is an offline, deterministic simulation of a six-station packaging line. All plants, batches, people, faults and measurements are synthetic. It cannot connect to or
          control real machines, PLCs or networks. Drawings are hand-built vector figures in the Hairline style (MIT-licensed kernel).
        </p>
      </div>
    </div>
  );
}
