import type { StationStatus } from '../domain/types';

const LABEL: Record<StationStatus, string> = {
  idle: 'Idle',
  processing: 'Running',
  starved: 'Starved',
  blocked: 'Blocked',
  faulted: 'Fault',
  maintenance: 'Maintenance',
  paused: 'Paused',
};

export const statusLabel = (s: StationStatus) => LABEL[s];

export const STATUS_HELP: Record<StationStatus, string> = {
  idle: 'No batch activity at this station',
  processing: 'Processing a unit',
  starved: 'Waiting for input from upstream',
  blocked: 'Finished output cannot leave, or a material is out',
  faulted: 'Fault latched — needs acknowledgement, a work order and repair',
  maintenance: 'Repair in progress; station offline',
  paused: 'Line paused; machine state preserved',
};

export function StatusDot({ status }: { status: StationStatus }) {
  return <span className={`dot-s s-${status}`} aria-hidden />;
}

export function StatusPill({ status, title }: { status: StationStatus; title?: string }) {
  return (
    <span className={`pill s-${status}`} title={title ?? STATUS_HELP[status]}>
      <StatusDot status={status} />
      {LABEL[status]}
    </span>
  );
}

export function SimBadge() {
  return (
    <span className="sim-badge" title="All data in LineFlow is synthetic and simulated. No real machines are controlled.">
      Simulation / Demo data
    </span>
  );
}
