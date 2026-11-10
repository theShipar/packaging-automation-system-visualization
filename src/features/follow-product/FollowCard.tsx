import { store } from '../../app/store';
import { unitOf } from '../../domain/core';
import { effectiveStatus } from '../../domain/kpis';
import type { Session } from '../../domain/types';
import { describeUnit } from '../../transport/poses';
import { StatusDot, statusLabel } from '../../ui/Status';

export function FollowCard({ s, unitId }: { s: Session; unitId: string }) {
  const u = unitOf(s, unitId);
  const story = describeUnit(s, u);
  const status = story.station ? effectiveStatus(s, story.station) : null;
  return (
    <div className="follow-card" role="status" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
        <span className="eyebrow">Following</span>
        {status && (
          <span className="row muted" style={{ gap: 6, fontSize: 11.5, fontWeight: 650 }}>
            <StatusDot status={status} /> {statusLabel(status)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }} className="num">
        {u.serial}
      </div>
      <div style={{ fontSize: 13, fontWeight: 650 }}>{story.stage}</div>
      <div className="muted" style={{ fontSize: 12 }}>
        {story.substep}
      </div>
      <button className="btn sm" onClick={() => store.setFollow(null)}>
        Stop following
      </button>
    </div>
  );
}

/** The unit "Follow next unit" picks for a station: the one in the machine, else the infeed head. */
export function nextUnitAt(s: Session, id: Parameters<typeof effectiveStatus>[1]): string | null {
  const st = s.stations[id];
  return st.current?.unitId ?? st.inQ[0] ?? st.outQ[0] ?? null;
}
