import { STATION_META } from '../domain/config';
import { stationView } from '../domain/kpis';
import type { Session, StationId } from '../domain/types';
import { StationStill } from '../vector/StationThumb';
import { Ring } from './Kit';
import { StatusPill } from './Status';

/** One station at a glance: status, cycle, input buffer and utilisation. */
export function MachineCard({ s, id, active, onSelect }: { s: Session; id: StationId; active: boolean; onSelect: (id: StationId | null) => void }) {
  const meta = STATION_META[id];
  const v = stationView(s, id);
  const alert = v.status === 'faulted' || v.status === 'maintenance';
  const cycle = v.avgCycle ?? s.config[id].cycleSeconds;
  const inQ = v.inQueue + v.incoming;
  return (
    <button
      type="button"
      className={`mcard${active ? ' on' : ''}${alert ? ' alert' : ''}`}
      onClick={() => onSelect(active ? null : id)}
      aria-pressed={active}
      aria-label={`${meta.name}: ${v.status}`}
    >
      <span className="mcard-h">
        <span className="no-pill">{meta.no}</span>
        <span className="name">{meta.short}</span>
      </span>
      <span className="mcard-thumb">
        <StationStill id={id} focus={active} />
      </span>
      <span className="mcard-f">
        <StatusPill status={v.status} />
        <Ring value={v.utilization} size={34} stroke={3.5} tone={active ? 'orange' : alert ? 'red' : undefined} title={v.utilization === null ? 'Utilisation appears after 1 min' : `Utilisation ${Math.round(v.utilization * 100)}%`} />
      </span>
      <span className="mcard-f">
        <span className="mstat" title={v.avgCycle ? 'Average of recent cycles' : 'Configured cycle time'}>
          <b>
            {cycle.toFixed(1)}
            <small>s</small>
          </b>
          <span>{v.avgCycle ? 'avg cycle' : 'cycle (set)'}</span>
        </span>
        <span className="mstat" style={{ alignItems: 'flex-end' }} title={`Input buffer ${inQ} of ${v.inCap}`}>
          <b>
            {inQ}
            <small>/{v.inCap}</small>
          </b>
          <span>in buffer</span>
        </span>
      </span>
    </button>
  );
}
