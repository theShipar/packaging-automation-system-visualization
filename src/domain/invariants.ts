import { CASE_SIZE, PALLET_CASES } from './config';
import { hashString } from './rng';
import { STATION_IDS, type Session } from './types';
import { unitCounts } from './kpis';

/** Returns a list of violated invariants; empty means the session is consistent. */
export function checkInvariants(s: Session): string[] {
  const errors: string[] = [];
  const c = unitCounts(s);
  const N = s.batch.planned;
  if (c.unreleased + c.wip + c.rejected + c.dispatched !== N)
    errors.push(`conservation: ${c.unreleased}+${c.wip}+${c.rejected}+${c.dispatched} != ${N}`);
  if (c.released !== s.releaseCursor) errors.push(`released ${c.released} != cursor ${s.releaseCursor}`);
  if (c.qaPassed !== c.acceptedAwaiting + c.packaged) errors.push('QA passed != accepted awaiting + packaged');
  if (c.packaged < c.dispatched) errors.push('packaged < dispatched');

  const seen = new Map<string, string>();
  const mark = (id: string, where: string) => {
    if (seen.has(id)) errors.push(`unit ${id} in ${seen.get(id)} and ${where}`);
    seen.set(id, where);
  };
  for (const id of STATION_IDS) {
    const st = s.stations[id];
    st.inQ.forEach((u) => mark(u, `${id}.in`));
    st.outQ.forEach((u) => mark(u, `${id}.out`));
    if (st.current) mark(st.current.unitId, `${id}.machine`);
  }
  s.transfers.forEach((t) => mark(t.unitId, 'transfer'));
  s.rejectTray.forEach((u) => mark(u, 'rejectTray'));
  for (const cs of s.cases) {
    cs.unitIds.forEach((u) => mark(u, `case ${cs.id}`));
    if (cs.unitIds.length > CASE_SIZE) errors.push(`case ${cs.id} over ${CASE_SIZE}`);
    if (cs.status !== 'open' && !cs.partial && cs.unitIds.length !== CASE_SIZE) errors.push(`case ${cs.id} sealed with ${cs.unitIds.length}`);
  }
  for (const p of s.pallets) if (p.caseIds.length > PALLET_CASES) errors.push(`pallet ${p.id} over ${PALLET_CASES}`);
  if (seen.size !== c.released) errors.push(`located ${seen.size} units but released ${c.released}`);

  for (const u of s.units) {
    if (u.state === 'rejected' && (u.packaged || u.caseId || u.shipmentId)) errors.push(`rejected ${u.id} reached packaging/dispatch`);
    if (u.state === 'dispatched' && !u.qaPassed) errors.push(`dispatched ${u.id} without QA pass`);
  }
  for (const m of Object.values(s.materials)) {
    if (m.available < 0 || m.reserved < 0) errors.push(`${m.id} negative stock`);
    if (m.opening + m.receipts !== m.available + m.reserved + m.consumed + m.scrapped + m.negAdj) errors.push(`${m.id} lot not conserved`);
  }
  const cartons = s.materials.retailCarton;
  if (cartons.consumed !== c.packaged) errors.push(`cartons consumed ${cartons.consumed} != packaged ${c.packaged}`);
  return errors;
}

/** Stable digest of the observable run state, used for determinism checks. */
export function sessionHash(s: Session): string {
  const c = unitCounts(s);
  const parts = [
    s.t.toFixed(4),
    s.seq,
    s.rng,
    JSON.stringify(c),
    s.events.map((e) => `${e.seq}:${e.type}:${e.virtualAt}:${e.unitId ?? ''}`).join('|'),
    s.inspections.map((i) => `${i.unitId}${i.result}${i.weight}`).join(''),
  ];
  return hashString(parts.join('#')).toString(16);
}
