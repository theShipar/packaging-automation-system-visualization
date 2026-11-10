import type { DomainEvent, EventType, QueueItem, QueueKind, Role, Session, Severity, StationId, Unit, UnitSlot } from './types';

export const pad = (n: number, w: number) => String(n).padStart(w, '0');
export const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

const PRIO: Record<QueueKind, number> = { CYCLE_DONE: 0, TRANSFER_DONE: 1, READY: 1, GATE: 2, SAMPLE: 3, COMMAND: 4 };

export function nextId(s: Session, prefix: string, width: number, start = 0): string {
  const n = (s.idSeq[prefix] ?? start) + 1;
  s.idSeq[prefix] = n;
  return `${prefix}-${pad(n, width)}`;
}

export function push(s: Session, kind: QueueKind, at: number, extra: Partial<QueueItem> = {}) {
  const item: QueueItem = { at: r6(at), prio: PRIO[kind], seq: ++s.qseq, kind, ...extra };
  const q = s.queue;
  let i = q.length;
  while (i > 0) {
    const p = q[i - 1];
    if (p.at < item.at || (p.at === item.at && (p.prio < item.prio || (p.prio === item.prio && p.seq < item.seq)))) break;
    i--;
  }
  q.splice(i, 0, item);
}

export interface EmitOpts {
  station?: StationId | null;
  unit?: string | null;
  actor?: Role | 'engine';
  source?: DomainEvent['source'];
  payload?: Record<string, unknown>;
}

export function emit(s: Session, type: EventType, severity: Severity, message: string, o: EmitOpts = {}) {
  const seq = ++s.seq;
  s.events.push({
    id: `E-${pad(seq, 6)}`,
    seq,
    runId: s.runId,
    virtualAt: r6(s.t),
    type,
    severity,
    stationId: o.station ?? null,
    batchId: s.batch.id,
    unitId: o.unit ?? null,
    actor: o.actor ?? 'engine',
    source: o.source ?? 'engine',
    message,
    payload: o.payload ?? {},
  });
}

export const unitOf = (s: Session, id: string) => s.units[Number(id.slice(1)) - 1];

export function place(u: Unit, station: StationId | null, slot: UnitSlot) {
  u.station = station;
  u.slot = slot;
  if (!u.qaPassed && u.state !== 'rejected') {
    u.state = slot === 'machine' ? 'processing' : slot === 'transfer' ? 'transfer' : 'queue';
  }
}
