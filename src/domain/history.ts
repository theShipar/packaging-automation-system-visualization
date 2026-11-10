/*
 * Synthetic history compiler (source: 'synthetic-fixture'). Deterministic from a fixed seed and a fixed
 * anchor date so fixtures are byte-stable. Daily KPI buckets are aggregated from batch records, never
 * drawn as free-standing random series.
 */
import { FAULTS } from './config';
import { hashString, makeRng } from './rng';
import type { DefectCode, FaultCode, StationId } from './types';

export const HISTORY_SEED = 'LF-DEMO-2026-01';
export const ANCHOR_DATE = '2026-11-09';
const DAY = 86400000;

export interface Sku {
  id: string;
  name: string;
  caseSize: number;
  cycleScale: number;
}

export const SKUS: Sku[] = [
  { id: 'SEN-KIT-A', name: 'Smart sensor kit A', caseSize: 12, cycleScale: 1 },
  { id: 'SEN-KIT-B', name: 'Smart sensor kit B', caseSize: 12, cycleScale: 1.04 },
  { id: 'SEN-KIT-C', name: 'Sensor kit C (twin pack)', caseSize: 12, cycleScale: 1.12 },
  { id: 'HUB-KIT-1', name: 'Hub starter kit', caseSize: 12, cycleScale: 1.08 },
  { id: 'HUB-KIT-2', name: 'Hub pro kit', caseSize: 12, cycleScale: 1.15 },
  { id: 'TAG-PACK-4', name: 'Tracker tag 4-pack', caseSize: 12, cycleScale: 0.95 },
  { id: 'TAG-PACK-8', name: 'Tracker tag 8-pack', caseSize: 12, cycleScale: 1.02 },
  { id: 'MTN-KIT-S', name: 'Motion kit S', caseSize: 12, cycleScale: 0.98 },
  { id: 'MTN-KIT-L', name: 'Motion kit L', caseSize: 12, cycleScale: 1.06 },
  { id: 'AIR-KIT-1', name: 'Air quality kit', caseSize: 12, cycleScale: 1.1 },
  { id: 'LEAK-KIT', name: 'Leak sensor kit', caseSize: 12, cycleScale: 0.97 },
  { id: 'DOOR-KIT', name: 'Door sensor kit', caseSize: 12, cycleScale: 0.93 },
];

export type HistStatus = 'completed' | 'partial' | 'planned' | 'cancelled' | 'inProgress';

export interface HistFault {
  id: string;
  code: FaultCode;
  station: StationId;
  at: string;
  downtimeMin: number;
  workOrderId: string;
}

export interface HistBatch {
  id: string;
  sku: string;
  order: string;
  status: HistStatus;
  start: string;
  end: string | null;
  planned: number;
  committed: number;
  released: number;
  rejected: number;
  dispatched: number;
  oee: number | null;
  availability: number | null;
  energyKWh: number;
  downtimeMin: number;
  faults: HistFault[];
  defects: Partial<Record<DefectCode, number>>;
  source: 'synthetic-fixture';
}

export interface DayBucket {
  date: string;
  weekday: number;
  shipped: number;
  rejected: number;
  inspected: number;
  runHours: number;
  downtimeMin: number;
  energyKWh: number;
  oee: number | null;
  maintenanceWindow: boolean;
}

export interface HistWorkOrder {
  id: string;
  assetId: string;
  station: StationId;
  faultId: string | null;
  code: FaultCode | 'PM';
  priority: 'P1' | 'P2' | 'P3';
  status: 'closed' | 'open' | 'inProgress';
  created: string;
  closed: string | null;
  description: string;
}

export interface HistEvent {
  id: string;
  at: string;
  type: string;
  station: StationId | null;
  severity: 'info' | 'warning' | 'critical';
  batchId: string;
  message: string;
}

export interface HistReject {
  serial: string;
  batchId: string;
  at: string;
  code: DefectCode;
  weight: number;
  visualScore: number;
  ruleVersion: string;
}

export interface History {
  seed: string;
  generatedFor: string;
  batches: HistBatch[];
  days: DayBucket[];
  workOrders: HistWorkOrder[];
  events: HistEvent[];
  rejects: HistReject[];
}

const iso = (ms: number) => new Date(ms).toISOString();

let cached: History | null = null;

export function buildHistory(): History {
  if (cached) return cached;
  const R = makeRng(hashString(HISTORY_SEED));
  const anchor = Date.parse(`${ANCHOR_DATE}T00:00:00Z`);
  const batches: HistBatch[] = [];
  const workOrders: HistWorkOrder[] = [];
  const events: HistEvent[] = [];
  const rejects: HistReject[] = [];
  let woN = 4980;
  let fN = 1900;
  let evN = 0;
  const ev = (at: number, type: string, station: StationId | null, severity: HistEvent['severity'], batchId: string, message: string) =>
    events.push({ id: `H-${String(++evN).padStart(5, '0')}`, at: iso(at), type, station, severity, batchId, message });

  // 25 closed historical batches on weekdays across the last 90 days.
  const weekdays: number[] = [];
  for (let d = 89; d >= 3; d--) {
    const t = anchor - d * DAY;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) weekdays.push(t);
  }
  const step = weekdays.length / 25;
  const defectCodes: DefectCode[] = ['MISSING_INSERT', 'WEIGHT_OUT_OF_RANGE', 'LABEL_ID_MISMATCH', 'SURFACE_DEFECT'];
  for (let i = 0; i < 25; i++) {
    const day = weekdays[Math.floor(i * step)];
    const id = `B-${String(816 + i).padStart(4, '0')}`;
    const sku = SKUS[R.int(0, SKUS.length - 1)];
    const planned = [1200, 1800, 2400, 2400, 3000][R.int(0, 4)];
    const committed = Math.round((planned * (0.94 + R.rnd() * 0.02)) / 12) * 12;
    const partial = i % 5 === 3;
    const released = partial ? Math.round(planned * (0.82 + R.rnd() * 0.1)) : planned;
    const defectRate = Math.max(0.004, 0.015 + R.gauss() * 0.005 + (sku.cycleScale > 1.1 ? 0.004 : 0));
    const rejected = Math.round(released * defectRate);
    const good = released - rejected;
    const dispatched = Math.floor(good / 12) * 12 + (good % 12 ? good % 12 : 0);
    const start = day + (6 + R.int(0, 3)) * 3600000 + R.int(0, 59) * 60000;
    const nFaults = R.int(0, 4);
    const faults: HistFault[] = [];
    let downtime = 0;
    for (let k = 0; k < nFaults; k++) {
      const def = FAULTS[R.int(0, FAULTS.length - 1)];
      const dmin = def.kind === 'stop' ? 4 + R.int(0, 22) : def.kind === 'material' ? 6 + R.int(0, 14) : 0;
      downtime += dmin;
      const at = start + R.int(10, 150) * 60000;
      const f: HistFault = { id: `F-${++fN}`, code: def.code, station: def.station, at: iso(at), downtimeMin: dmin, workOrderId: `WO-${++woN}` };
      faults.push(f);
      workOrders.push({
        id: f.workOrderId,
        assetId: def.componentId,
        station: def.station,
        faultId: f.id,
        code: def.code,
        priority: def.severity === 'critical' ? 'P1' : 'P2',
        status: 'closed',
        created: iso(at + 60000),
        closed: iso(at + (dmin + 3) * 60000),
        description: `${def.title} — ${def.recovery}`,
      });
      ev(at, 'FAULT_RAISED', def.station, def.severity, id, `${def.code} on ${def.componentId}: ${def.title}`);
      ev(at + 40000, 'FAULT_ACKNOWLEDGED', def.station, 'info', id, `${def.code} acknowledged`);
      ev(at + 60000, 'WORK_ORDER_CREATED', def.station, 'info', id, `${f.workOrderId} created for ${def.code}`);
      ev(at + dmin * 60000, 'FAULT_RESOLVED', def.station, 'info', id, `${def.code} resolved (${def.recovery})`);
      ev(at + (dmin + 3) * 60000, 'WORK_ORDER_COMPLETED', def.station, 'info', id, `${f.workOrderId} verified and closed`);
    }
    const idealHours = (released * 4.5 * sku.cycleScale) / 3600;
    const runHours = idealHours * (1.03 + R.rnd() * 0.06) + downtime / 60;
    const availability = 1 - downtime / 60 / runHours;
    const performance = Math.min(1, idealHours / (runHours - downtime / 60));
    const quality = good / released;
    const end = start + runHours * 3600000;
    const defects: Partial<Record<DefectCode, number>> = {};
    for (let r = 0; r < rejected; r++) {
      const code = defectCodes[R.rnd() < 0.3 ? 0 : R.rnd() < 0.45 ? 1 : R.rnd() < 0.5 ? 2 : 3];
      defects[code] = (defects[code] ?? 0) + 1;
      const at = start + R.rnd() * (end - start);
      const serial = `SN-${id.slice(2)}-${String(R.int(1, released)).padStart(4, '0')}`;
      const weight = code === 'WEIGHT_OUT_OF_RANGE' ? 195 + (R.rnd() < 0.5 ? -1 : 1) * (11 + R.rnd() * 5) : 195 + R.gauss() * 2.2;
      const visual = code === 'SURFACE_DEFECT' ? 0.24 + R.rnd() * 0.1 : 0.06 + Math.abs(R.gauss()) * 0.035;
      rejects.push({ serial, batchId: id, at: iso(at), code, weight: Math.round(weight * 10) / 10, visualScore: Math.round(visual * 1000) / 1000, ruleVersion: 'QC-STD-1.0' });
      ev(at, 'QA_INSPECTION_REJECTED', 'qa', 'warning', id, `${serial} rejected: ${code}`);
    }
    ev(start, 'BATCH_RELEASED', null, 'info', id, `Batch ${id} released: ${planned} planned, ${committed} committed (${sku.id})`);
    const shipments = Math.max(1, Math.ceil(dispatched / 720));
    for (let k = 0; k < shipments; k++) {
      const at = start + ((k + 1) / shipments) * (end - start);
      const qty = k === shipments - 1 ? dispatched - 720 * (shipments - 1) : 720;
      ev(at, 'SHIPMENT_DISPATCHED', 'dispatch', 'info', id, `Pallet shipment ${k + 1}/${shipments}: ${qty} kits`);
    }
    const status: HistStatus = partial || dispatched < committed ? 'partial' : 'completed';
    ev(end, 'BATCH_COMPLETED', null, status === 'partial' ? 'warning' : 'info', id, `Batch ${id} ${status}: ${dispatched} shipped of ${committed} committed`);
    batches.push({
      id,
      sku: sku.id,
      order: `ORD-${6000 + i}`,
      status,
      start: iso(start),
      end: iso(end),
      planned,
      committed,
      released,
      rejected,
      dispatched,
      oee: Math.round(availability * performance * quality * 1000) / 1000,
      availability: Math.round(availability * 1000) / 1000,
      energyKWh: Math.round(runHours * (12.5 + R.rnd() * 2) * 10) / 10,
      downtimeMin: downtime,
      faults,
      defects,
      source: 'synthetic-fixture',
    });
  }

  // Preventive maintenance windows: Saturdays every other week.
  const pmAssets: [string, StationId, string][] = [
    ['ROB-GRIPPER-01', 'robot', 'Replace gripper suction cups'],
    ['PKG-HEATER-01', 'packaging', 'Seal heater inspection'],
    ['INT-SCANNER-01', 'intake', 'Clean scan head optics'],
    ['PKG-LABELER-01', 'packaging', 'Replace printer ribbon'],
    ['ASM-DRIVE-01', 'assembly', 'Belt drive tension check'],
    ['ROB-ENCODER-01', 'robot', 'Encoder calibration'],
    ['PKG-PHOTOEYE-01', 'packaging', 'Photoeye module alignment'],
    ['QA-CAMERA-01', 'qa', 'Vision calibration target run'],
  ];
  const pmDays = new Set<string>();
  for (let d = 89, n = 0; d >= 1; d--) {
    const t = anchor - d * DAY;
    if (new Date(t).getUTCDay() !== 6) continue;
    if (n++ % 2) continue;
    pmDays.add(iso(t).slice(0, 10));
    for (let k = 0; k < 3; k++) {
      const [asset, station, desc] = pmAssets[(n + k) % pmAssets.length];
      const at = t + (8 + k) * 3600000;
      workOrders.push({ id: `WO-${++woN}`, assetId: asset, station, faultId: null, code: 'PM', priority: 'P3', status: 'closed', created: iso(at), closed: iso(at + 50 * 60000), description: `Planned: ${desc}` });
    }
  }
  workOrders.push({ id: `WO-${++woN}`, assetId: 'DSP-SCANNER-01', station: 'dispatch', faultId: null, code: 'PM', priority: 'P3', status: 'open', created: iso(anchor - DAY), closed: null, description: 'Planned: Manifest scanner firmware check' });

  // Planned / cancelled orders and the live batch.
  const future: [string, HistStatus, number][] = [
    ['B-0841', 'cancelled', -2],
    ['B-0843', 'planned', 1],
    ['B-0844', 'planned', 2],
    ['B-0845', 'planned', 4],
  ];
  for (const [id, status, dd] of future) {
    const sku = SKUS[R.int(0, SKUS.length - 1)];
    batches.push({ id, sku: sku.id, order: `ORD-${6100 + Number(id.slice(2)) - 840}`, status, start: iso(anchor + dd * DAY + 7 * 3600000), end: null, planned: 2400, committed: 2304, released: 0, rejected: 0, dispatched: 0, oee: null, availability: null, energyKWh: 0, downtimeMin: 0, faults: [], defects: {}, source: 'synthetic-fixture' });
  }

  // Daily buckets aggregated from batch records.
  const days: DayBucket[] = [];
  for (let d = 89; d >= 1; d--) {
    const t = anchor - d * DAY;
    const date = iso(t).slice(0, 10);
    const todays = batches.filter((b) => b.end && b.start.slice(0, 10) === date);
    const runHours = todays.reduce((a, b) => a + (Date.parse(b.end!) - Date.parse(b.start)) / 3600000, 0);
    const oees = todays.filter((b) => b.oee !== null);
    days.push({
      date,
      weekday: new Date(t).getUTCDay(),
      shipped: todays.reduce((a, b) => a + b.dispatched, 0),
      rejected: todays.reduce((a, b) => a + b.rejected, 0),
      inspected: todays.reduce((a, b) => a + b.rejected + b.dispatched, 0),
      runHours: Math.round(runHours * 100) / 100,
      downtimeMin: todays.reduce((a, b) => a + b.downtimeMin, 0),
      energyKWh: Math.round(todays.reduce((a, b) => a + b.energyKWh, 0) * 10) / 10,
      oee: oees.length ? oees.reduce((a, b) => a + b.oee!, 0) / oees.length : null,
      maintenanceWindow: pmDays.has(date),
    });
  }
  events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  cached = { seed: HISTORY_SEED, generatedFor: ANCHOR_DATE, batches, days, workOrders, events, rejects };
  return cached;
}
