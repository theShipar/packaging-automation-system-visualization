import {
  CASE_SIZE,
  DEFAULT_CONFIG,
  ENGINE_VERSION,
  FAULT_DEF,
  MATERIALS,
  PALLET_CASES,
  PERMISSIONS,
  ROLE_LABEL,
  SETTINGS_SCHEMA,
  STATION_META,
} from './config';
import { BELT_SPEED, LANE_SPEC, SLOT, inTarget, posAt, spawnPos, visibleIn } from './conveyor';
import { emit, nextId, pad, place, push, r6, unitOf } from './core';
import { next } from './rng';
import { completeTransfer, holdAtMouth, retargetIn, retargetOut, tryTransfer } from './transfer';
import {
  STATION_IDS,
  type Command,
  type CommandResult,
  type DefectCode,
  type Fault,
  type FaultCode,
  type MaterialId,
  type MaterialLot,
  type Role,
  type ScheduledCommand,
  type Session,
  type StationConfig,
  type StationId,
  type StationState,
  type StationStatus,
  type Unit,
} from './types';

export interface CreateOptions {
  seed?: number;
  runId?: string;
  scenarioId?: string;
  batchId?: string;
  planned?: number;
  committedGood?: number;
  config?: Partial<Record<StationId, Partial<StationConfig>>>;
  materials?: Partial<Record<MaterialId, number>>;
  scheduled?: ScheduledCommand[];
}

const NEEDS: Partial<Record<StationId, MaterialId[]>> = {
  assembly: ['batteryPack', 'leaflet'],
  packaging: ['retailCarton', 'seal', 'label'],
};
const MATERIAL_FAULT: Partial<Record<MaterialId, FaultCode>> = {
  batteryPack: 'ASM_PARTS_EMPTY',
  leaflet: 'ASM_PARTS_EMPTY',
  retailCarton: 'PKG_CARTON_OUT',
  label: 'PKG_LABEL_OUT',
};
const FAULT_MATERIALS: Partial<Record<FaultCode, MaterialId[]>> = {
  ASM_PARTS_EMPTY: ['batteryPack', 'leaflet'],
  PKG_CARTON_OUT: ['retailCarton'],
  PKG_LABEL_OUT: ['label'],
};
const DEFECT_WEIGHTS: [DefectCode, number][] = [
  ['MISSING_INSERT', 0.3],
  ['WEIGHT_OUT_OF_RANGE', 0.3],
  ['LABEL_ID_MISMATCH', 0.2],
  ['SURFACE_DEFECT', 0.2],
];


function emptyTimes(): Record<StationStatus, number> {
  return { idle: 0, processing: 0, starved: 0, blocked: 0, faulted: 0, maintenance: 0, paused: 0 };
}

function newStation(id: StationId): StationState {
  return {
    id,
    inQ: [],
    outQ: [],
    incoming: 0,
    current: null,
    status: 'idle',
    blockReason: null,
    started: 0,
    completed: 0,
    lastCompletedAt: null,
    timeIn: emptyTimes(),
    energyKWh: 0,
    recentCycles: [],
    completionTimes: [],
    pendingRecoveryFaultId: null,
    blockedSince: null,
    lastBlockedEventAt: -1e9,
    wakeAt: null,
  };
}

export function createSession(o: CreateOptions = {}): Session {
  const seed = o.seed ?? 842;
  const batchId = o.batchId ?? 'B-0842';
  const planned = o.planned ?? 2400;
  const tag = batchId.replace(/\D/g, '') || '0000';
  const units: Unit[] = Array.from({ length: planned }, (_, i) => ({
    id: `U${pad(i + 1, 4)}`,
    serial: `SN-${tag}-${pad(i + 1, 4)}`,
    idx: i,
    state: 'unreleased',
    station: null,
    slot: 'none',
    latent: null,
    qaPassed: false,
    packaged: false,
    inspectionId: null,
    caseId: null,
    shipmentId: null,
    releasedAt: null,
    rejectedAt: null,
    dispatchedAt: null,
    scanAttempts: 0,
    track: null,
  }));
  const config = {} as Record<StationId, StationConfig>;
  for (const id of STATION_IDS) config[id] = { ...DEFAULT_CONFIG[id], ...(o.config?.[id] ?? {}) };
  const materials = {} as Record<MaterialId, MaterialLot>;
  for (const m of MATERIALS) {
    const opening = o.materials?.[m.id] ?? m.opening;
    materials[m.id] = {
      id: m.id,
      lotId: `${m.lotPrefix}-${tag}-${pad((seed % 97) + 1, 2)}`,
      name: m.name,
      unit: m.unit,
      station: m.station,
      opening,
      receipts: 0,
      available: opening,
      reserved: 0,
      consumed: 0,
      scrapped: 0,
      negAdj: 0,
      reorderPoint: m.reorderPoint,
      lowNotified: false,
    };
  }
  const stations = {} as Record<StationId, StationState>;
  for (const id of STATION_IDS) stations[id] = newStation(id);
  const s: Session = {
    engineVersion: ENGINE_VERSION,
    runId: o.runId ?? `RUN-${pad(seed % 10000, 4)}`,
    scenarioId: o.scenarioId ?? 'baseline',
    seed,
    rng: seed >>> 0,
    status: 'ready',
    speed: 1,
    t: 0,
    seq: 0,
    qseq: 0,
    jobSeq: 0,
    idSeq: {},
    batch: {
      id: batchId,
      sku: 'SEN-KIT-A',
      skuName: 'Sensor kit A',
      planned,
      committedGood: o.committedGood ?? 2300,
      status: 'planned',
      releasedAt: null,
      completedAt: null,
      committedReachedAt: null,
    },
    units,
    releaseCursor: 0,
    lineWip: 0,
    stations,
    config,
    configVersion: 1,
    qaRule: { version: 'QC-STD-1.0', weightMin: config.qa.weightMin, weightMax: config.qa.weightMax, visualMax: config.qa.visualMax },
    qaDrift: 0,
    barcodeDegraded: false,
    materials,
    transfers: [],
    rejectTray: [],
    cases: [],
    openCaseId: null,
    pallets: [],
    openPalletId: null,
    shipments: [],
    faults: [],
    workOrders: [],
    inspections: [],
    events: [],
    queue: [],
    samples: [],
    commandLog: [],
    rejects: [],
    awaitingPartialApproval: false,
  };
  for (const c of o.scheduled ?? []) push(s, 'COMMAND', c.at, { command: c.command, actor: c.actor ?? 'supervisor' });
  emit(s, 'RUN_CREATED', 'info', `Run ${s.runId} created for batch ${batchId} (seed ${seed})`, {
    payload: { seed, planned, committedGood: s.batch.committedGood, scenarioId: s.scenarioId },
  });
  return s;
}

/* ---------------------------------------------------------------- helpers */

function rand(s: Session): number {
  const [v, n] = next(s.rng);
  s.rng = n;
  return v;
}

function gauss(s: Session): number {
  const u = Math.max(rand(s), 1e-9);
  const v = rand(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const isOpenFault = (f: Fault) => f.status === 'active' || f.status === 'acknowledged' || f.status === 'repairInProgress';

export function stopFault(s: Session, id: StationId): Fault | undefined {
  return s.faults.find((f) => f.station === id && f.kind === 'stop' && isOpenFault(f));
}

export function stagingUnits(s: Session): number {
  let n = 0;
  for (const c of s.cases) if (c.status === 'open' || c.status === 'sealed') n += c.unitIds.length;
  return n;
}

export function shippedUnits(s: Session): number {
  let n = 0;
  for (const sh of s.shipments) n += sh.units;
  return n;
}

function lowCheck(s: Session, m: MaterialLot) {
  if (!m.lowNotified && m.available <= m.reorderPoint) {
    m.lowNotified = true;
    emit(s, 'MATERIAL_LOW', 'warning', `${m.name} low: ${m.available} ${m.unit} available (reorder at ${m.reorderPoint})`, {
      station: m.station,
      payload: { material: m.id, lotId: m.lotId, available: m.available },
    });
  }
}

/* ---------------------------------------------------------------- clock */

function power(s: Session, st: StationState): number {
  const c = s.config[st.id];
  switch (st.status) {
    case 'processing':
      return c.energyKW;
    case 'faulted':
      return c.energyKW * 0.1;
    case 'maintenance':
      return c.energyKW * 0.05;
    default:
      return c.energyKW * c.idleFactor;
  }
}

function accrue(s: Session, to: number) {
  const dt = to - s.t;
  if (dt <= 0) return;
  for (const id of STATION_IDS) {
    const st = s.stations[id];
    st.timeIn[st.status] += dt;
    st.energyKWh += (power(s, st) * dt) / 3600;
  }
  s.t = r6(to);
}

/* ---------------------------------------------------------------- flow */

function tryRelease(s: Session): boolean {
  const b = s.batch;
  if (b.status !== 'released' && b.status !== 'inProgress') return false;
  if (s.releaseCursor >= s.units.length || b.committedReachedAt !== null) return false;
  if (stopFault(s, 'intake')) return false;
  const st = s.stations.intake;
  const cfg = s.config.intake;
  const wave = Math.min(cfg.feedReleaseSize, s.units.length - s.releaseCursor);
  if (cfg.bufferIn - st.inQ.length - st.incoming < wave) return false;
  if (s.lineWip + wave > cfg.wipCap) return false;
  const core = s.materials.deviceCore;
  const n = Math.min(wave, core.available);
  if (n <= 0) {
    if (!st.inQ.length && !st.current) st.blockReason = 'Device cores out of stock';
    return false;
  }
  if (st.blockReason?.startsWith('Device')) st.blockReason = null;
  for (let k = 0; k < n; k++) {
    const u = s.units[s.releaseCursor++];
    u.releasedAt = s.t;
    place(u, 'intake', 'in');
    const idx = st.inQ.length;
    const target = inTarget('intake', idx);
    const ahead = idx > 0 ? unitOf(s, st.inQ[idx - 1]).track : null;
    const behind = ahead ? posAt(ahead, s.t) + SLOT : 0;
    u.track = { pos: idx < visibleIn('intake') ? Math.min(LANE_SPEC.intake.inLen, Math.max(spawnPos(target), behind)) : LANE_SPEC.intake.inLen, at: s.t, target };
    st.inQ.push(u.id);
    holdAtMouth(s, 'intake', idx);
    s.lineWip++;
    emit(s, 'UNIT_RELEASED', 'info', `${u.serial} released to intake`, { station: 'intake', unit: u.id });
  }
  core.available -= n;
  core.consumed += n;
  emit(s, 'MATERIAL_CONSUMED', 'info', `${n} device cores issued from ${core.lotId}`, {
    station: 'intake',
    payload: { items: [{ material: 'deviceCore', lotId: core.lotId, qty: n }] },
  });
  lowCheck(s, core);
  if (b.status === 'released') b.status = 'inProgress';
  return true;
}

function raiseMaterialFault(s: Session, m: MaterialId) {
  const code = MATERIAL_FAULT[m];
  if (!code || s.faults.some((f) => f.code === code && isOpenFault(f))) return;
  raiseFault(s, code, 'engine', 'engine', false);
}

function tryStart(s: Session, id: StationId): boolean {
  const st = s.stations[id];
  const cfg = s.config[id];
  const stopped = !!stopFault(s, id);
  if (st.current) {
    const j = st.current;
    if (!j.done && j.finishAt === null && !stopped) {
      j.finishAt = r6(s.t + j.remaining);
      push(s, 'CYCLE_DONE', j.finishAt, { station: id, jobId: j.jobId });
      return true;
    }
    return false;
  }
  if (stopped) return false;
  if (!st.inQ.length) {
    if (id !== 'intake') st.blockReason = null;
    return false;
  }
  const need = NEEDS[id] ?? [];
  const short = need.find((m) => s.materials[m].available < 1);
  if (short) {
    st.blockReason = `${s.materials[short].name} out of stock`;
    raiseMaterialFault(s, short);
    return false;
  }
  if (id === 'dispatch') {
    if (stagingUnits(s) + 1 > cfg.bufferOut) {
      st.blockReason = 'Staging full — waiting for outbound gate';
      return false;
    }
    if (!s.openCaseId) {
      const sc = s.materials.shippingCase;
      if (sc.available < 1) {
        st.blockReason = 'Shipping cases out of stock';
        return false;
      }
      sc.available--;
      sc.consumed++;
      lowCheck(s, sc);
      const c = { id: nextId(s, 'CASE', 5), unitIds: [], status: 'open' as const, partial: false, openedAt: s.t, sealedAt: null, palletId: null, shipmentId: null };
      s.cases.push(c);
      s.openCaseId = c.id;
      emit(s, 'CASE_OPENED', 'info', `Case ${c.id} opened (lot ${sc.lotId})`, { station: 'dispatch', payload: { caseId: c.id } });
    }
  }
  st.blockReason = null;
  const unitId = st.inQ.shift()!;
  const u = unitOf(s, unitId);
  const from = u.track ? posAt(u.track, s.t) : 0;
  const held = u.track && u.track.at > s.t ? u.track.at - s.t : 0;
  u.track = { pos: from, at: s.t + held, target: 0 };
  for (const m of need) {
    s.materials[m].available--;
    s.materials[m].reserved++;
  }
  let duration = cfg.cycleSeconds;
  if (id === 'intake') {
    let attempts = 1;
    let conf = 0.955 - Math.abs(gauss(s)) * 0.03;
    while (conf < cfg.scanConfidenceMin && attempts < 3) {
      attempts++;
      conf = 0.955 - Math.abs(gauss(s)) * 0.03;
    }
    u.scanAttempts = attempts;
    duration += (attempts - 1) * 1.2;
    if (attempts > 1)
      emit(s, 'INTAKE_SCAN_RETRY', 'info', `${u.serial} rescanned (${attempts} reads)`, {
        station: id,
        unit: u.id,
        payload: { attempts, confidence: Math.round(conf * 1000) / 1000 },
      });
  }
  if (id === 'qa') inspect(s, u);
  place(u, id, 'machine');
  const jobId = ++s.jobSeq;
  const finishAt = r6(s.t + duration);
  st.current = { jobId, unitId, startAt: s.t, duration, remaining: duration, finishAt, done: false, reserved: need, travel: r6(held + from / BELT_SPEED) };
  retargetIn(s, id);
  st.started++;
  push(s, 'CYCLE_DONE', finishAt, { station: id, jobId });
  emit(s, 'STATION_CYCLE_STARTED', 'info', `${STATION_META[id].short} started ${u.serial}`, {
    station: id,
    unit: u.id,
    payload: { cycleSeconds: duration, configVersion: s.configVersion },
  });
  return true;
}

function inspect(s: Session, u: Unit) {
  const r = s.qaRule;
  let weight = 195 + gauss(s) * 2.2;
  if (u.latent === 'WEIGHT_OUT_OF_RANGE') weight = 195 + (rand(s) < 0.5 ? -1 : 1) * (11 + rand(s) * 5);
  let visual = 0.06 + Math.abs(gauss(s)) * 0.035 + s.qaDrift + (s.qaDrift ? gauss(s) * 0.04 : 0);
  if (u.latent === 'SURFACE_DEFECT') visual += 0.22 + rand(s) * 0.1;
  visual = Math.max(0, visual);
  const barcodeValid = u.latent !== 'LABEL_ID_MISMATCH' && !(s.barcodeDegraded && rand(s) < 0.3);
  const insertDetected = u.latent !== 'MISSING_INSERT';
  const codes: DefectCode[] = [];
  if (!insertDetected) codes.push('MISSING_INSERT');
  if (weight < r.weightMin || weight > r.weightMax) codes.push('WEIGHT_OUT_OF_RANGE');
  if (!barcodeValid) codes.push('LABEL_ID_MISMATCH');
  if (visual > r.visualMax) codes.push('SURFACE_DEFECT');
  const id = nextId(s, 'QI', 6);
  s.inspections.push({
    id,
    unitId: u.id,
    serial: u.serial,
    at: s.t,
    ruleVersion: r.version,
    weight: Math.round(weight * 10) / 10,
    visualScore: Math.round(visual * 1000) / 1000,
    barcodeValid,
    insertDetected,
    result: codes.length ? 'reject' : 'pass',
    codes,
  });
  u.inspectionId = id;
}

function completeCycle(s: Session, id: StationId, jobId: number, at: number) {
  const st = s.stations[id];
  const job = st.current;
  if (!job || job.jobId !== jobId || job.finishAt !== at) return;
  job.finishAt = null;
  job.remaining = 0;
  job.done = true;
  const u = unitOf(s, job.unitId);
  st.completed++;
  st.lastCompletedAt = s.t;
  st.recentCycles.push(r6(job.duration));
  if (st.recentCycles.length > 24) st.recentCycles.shift();
  st.completionTimes.push(s.t);
  while (st.completionTimes.length && st.completionTimes[0] < s.t - 3600) st.completionTimes.shift();
  if (job.reserved.length) {
    const items = job.reserved.map((m) => {
      const lot = s.materials[m];
      lot.reserved--;
      lot.consumed++;
      lowCheck(s, lot);
      return { material: m, lotId: lot.lotId, qty: 1 };
    });
    job.reserved = [];
    emit(s, 'MATERIAL_CONSUMED', 'info', `${items.map((i) => i.material).join(', ')} consumed for ${u.serial}`, {
      station: id,
      unit: u.id,
      payload: { items },
    });
  }
  emit(s, 'STATION_CYCLE_COMPLETED', 'info', `${STATION_META[id].short} completed ${u.serial}`, {
    station: id,
    unit: u.id,
    payload: { cycleSeconds: r6(s.t - job.startAt) },
  });
  if (id === 'assembly' && rand(s) < s.config.qa.defectRate) {
    let r = rand(s);
    for (const [code, w] of DEFECT_WEIGHTS) {
      r -= w;
      if (r <= 0) {
        u.latent = code;
        break;
      }
    }
    u.latent ??= 'SURFACE_DEFECT';
  }
  if (id === 'qa') {
    const insp = s.inspections.find((i) => i.id === u.inspectionId)!;
    if (insp.result === 'reject') {
      u.state = 'rejected';
      u.rejectedAt = s.t;
      place(u, 'qa', 'tray');
      u.track = null;
      s.rejectTray.push(u.id);
      s.lineWip--;
      st.current = null;
      emit(s, 'QA_INSPECTION_REJECTED', 'warning', `${u.serial} rejected: ${insp.codes.join(', ')}`, {
        station: id,
        unit: u.id,
        payload: { inspectionId: insp.id, codes: insp.codes, weight: insp.weight, visualScore: insp.visualScore, ruleVersion: insp.ruleVersion },
      });
    } else {
      u.qaPassed = true;
      u.state = 'acceptedAwaitingPackaging';
      emit(s, 'QA_INSPECTION_PASSED', 'info', `${u.serial} passed ${insp.ruleVersion}`, {
        station: id,
        unit: u.id,
        payload: { inspectionId: insp.id, weight: insp.weight, visualScore: insp.visualScore },
      });
    }
  }
  if (id === 'packaging') {
    u.packaged = true;
    u.state = 'packed';
  }
  if (st.pendingRecoveryFaultId) {
    const f = s.faults.find((x) => x.id === st.pendingRecoveryFaultId);
    st.pendingRecoveryFaultId = null;
    if (f && f.status === 'resolved') {
      f.status = 'recovered';
      f.recoveredAt = s.t;
      emit(s, 'STATION_RECOVERED', 'info', `${STATION_META[id].name} recovered after ${f.code}`, {
        station: id,
        payload: { faultId: f.id, code: f.code },
      });
    }
  }
  flushDone(s, id);
}

function flushDone(s: Session, id: StationId): boolean {
  const st = s.stations[id];
  const job = st.current;
  if (!job?.done) return false;
  const u = unitOf(s, job.unitId);
  if (id === 'dispatch') {
    const c = s.cases.find((x) => x.id === s.openCaseId);
    if (!c) return false;
    c.unitIds.push(u.id);
    u.caseId = c.id;
    place(u, 'dispatch', 'staged');
    u.track = null;
    st.current = null;
    if (c.unitIds.length >= CASE_SIZE) sealCase(s, c.id, false);
    return true;
  }
  if (st.outQ.length >= s.config[id].bufferOut) return false;
  st.outQ.push(u.id);
  place(u, id, 'out');
  u.track = { pos: LANE_SPEC[id].exitLen, at: s.t, target: 0 };
  retargetOut(s, id);
  st.current = null;
  return true;
}

function sealCase(s: Session, caseId: string, partial: boolean) {
  const c = s.cases.find((x) => x.id === caseId)!;
  c.status = 'sealed';
  c.partial = partial;
  c.sealedAt = s.t;
  s.openCaseId = null;
  let p = s.pallets.find((x) => x.id === s.openPalletId);
  if (!p) {
    p = { id: nextId(s, 'PAL', 4), caseIds: [], status: 'open', openedAt: s.t, closedAt: null };
    s.pallets.push(p);
    s.openPalletId = p.id;
    emit(s, 'PALLET_OPENED', 'info', `Pallet ${p.id} opened`, { station: 'dispatch', payload: { palletId: p.id } });
  }
  p.caseIds.push(c.id);
  c.palletId = p.id;
  emit(s, 'CASE_SEALED', 'info', `Case ${c.id} sealed with ${c.unitIds.length} kits${partial ? ' (approved partial)' : ''}`, {
    station: 'dispatch',
    payload: { caseId: c.id, units: c.unitIds.length, palletId: p.id, partial },
  });
  if (p.caseIds.length >= PALLET_CASES) {
    p.status = 'closed';
    p.closedAt = s.t;
    s.openPalletId = null;
    emit(s, 'PALLET_CLOSED', 'info', `Pallet ${p.id} closed with ${p.caseIds.length} cases`, { station: 'dispatch', payload: { palletId: p.id } });
  }
}

function gate(s: Session) {
  if (s.status === 'completed') return;
  push(s, 'GATE', s.t + s.config.dispatch.dispatchCadenceSec);
  if (stopFault(s, 'dispatch') || !s.config.dispatch.autoDispatch) return;
  const sealed = s.cases.filter((c) => c.status === 'sealed');
  if (!sealed.length) return;
  const sh = { id: nextId(s, 'SH', 4), at: s.t, caseIds: sealed.map((c) => c.id), units: 0 };
  for (const c of sealed) {
    c.status = 'shipped';
    c.shipmentId = sh.id;
    for (const uid of c.unitIds) {
      const u = unitOf(s, uid);
      u.state = 'dispatched';
      u.slot = 'shipped';
      u.dispatchedAt = s.t;
      u.shipmentId = sh.id;
      sh.units++;
    }
  }
  s.shipments.push(sh);
  emit(s, 'SHIPMENT_DISPATCHED', 'info', `${sh.id} dispatched: ${sealed.length} case${sealed.length > 1 ? 's' : ''}, ${sh.units} kits`, {
    station: 'dispatch',
    payload: { shipmentId: sh.id, caseIds: sh.caseIds, units: sh.units },
  });
  const shipped = shippedUnits(s);
  if (s.batch.committedReachedAt === null && shipped >= s.batch.committedGood) {
    s.batch.committedReachedAt = s.t;
    emit(s, 'BATCH_COMMITTED_REACHED', 'info', `Committed ${s.batch.committedGood} good units shipped; releases stop, line runs down`, {
      payload: { shipped },
    });
  }
}

function sample(s: Session) {
  push(s, 'SAMPLE', s.t + 30);
  let wip = 0;
  let rejected = 0;
  for (const u of s.units) {
    if (u.state === 'rejected') rejected++;
    else if (u.state !== 'unreleased' && u.state !== 'dispatched') wip++;
  }
  const shipped = shippedUnits(s);
  let recent = 0;
  for (const sh of s.shipments) if (sh.at > s.t - 900) recent += sh.units;
  const win = Math.min(900, s.t);
  const statuses = {} as Record<StationId, StationStatus>;
  let energy = 0;
  for (const id of STATION_IDS) {
    statuses[id] = s.stations[id].status;
    energy += s.stations[id].energyKWh;
  }
  s.samples.push({
    t: s.t,
    shipped,
    rejected,
    inspected: s.inspections.length,
    wip,
    energyKWh: Math.round(energy * 1000) / 1000,
    throughput: win > 0 ? Math.round((recent / win) * 3600) : 0,
    statuses,
  });
}

function pump(s: Session) {
  if (s.status !== 'running') return;
  for (let guard = 0; guard < 200; guard++) {
    let changed = false;
    for (let i = STATION_IDS.length - 1; i >= 0; i--) {
      const id = STATION_IDS[i];
      if (flushDone(s, id)) changed = true;
      if (tryTransfer(s, i)) changed = true;
      if (tryStart(s, id)) changed = true;
    }
    if (tryRelease(s)) changed = true;
    if (!changed) break;
  }
}

function statusOf(s: Session, id: StationId): StationStatus {
  const st = s.stations[id];
  if (s.faults.some((f) => f.station === id && f.status === 'repairInProgress')) return 'maintenance';
  if (stopFault(s, id)) return 'faulted';
  if (st.current?.done || st.blockReason) return 'blocked';
  if (st.current) return 'processing';
  if (s.status === 'ready' || s.status === 'completed') return 'idle';
  return 'starved';
}

function reconcile(s: Session) {
  for (const id of STATION_IDS) {
    const st = s.stations[id];
    const prev = st.status;
    const now = statusOf(s, id);
    if (now === prev) continue;
    st.status = now;
    if (now === 'blocked') {
      st.blockedSince = s.t;
      if (s.t - st.lastBlockedEventAt >= 60) {
        st.lastBlockedEventAt = s.t;
        const reason = st.blockReason ?? 'Output buffer full — downstream not accepting';
        emit(s, 'STATION_BLOCKED', 'warning', `${STATION_META[id].name} blocked: ${reason}`, { station: id, payload: { reason } });
      }
    } else if (prev === 'blocked') {
      const lasted = st.blockedSince === null ? 0 : s.t - st.blockedSince;
      st.blockedSince = null;
      if (lasted >= 20)
        emit(s, 'STATION_UNBLOCKED', 'info', `${STATION_META[id].name} flowing again after ${Math.round(lasted)} s blocked`, {
          station: id,
          payload: { blockedSeconds: Math.round(lasted) },
        });
    }
  }
}

function checkCompletion(s: Session) {
  if (s.status === 'completed' || s.status === 'ready') return;
  if (s.releaseCursor < s.units.length && s.batch.committedReachedAt === null) return;
  if (s.lineWip > 0 || s.transfers.length) return;
  const d = s.stations.dispatch;
  if (d.inQ.length || d.current || d.incoming) return;
  for (const id of STATION_IDS) {
    const st = s.stations[id];
    if (st.inQ.length || st.outQ.length || st.current) return;
  }
  if (s.cases.some((c) => c.status === 'sealed')) return;
  const open = s.cases.find((c) => c.id === s.openCaseId);
  if (open && open.unitIds.length) {
    if (!s.awaitingPartialApproval) {
      s.awaitingPartialApproval = true;
      emit(s, 'STATION_BLOCKED', 'warning', `Final case ${open.id} holds ${open.unitIds.length} kits — operator approval needed to close a partial case`, {
        station: 'dispatch',
        payload: { caseId: open.id, units: open.unitIds.length },
      });
    }
    return;
  }
  const shipped = shippedUnits(s);
  s.batch.status = shipped >= s.batch.committedGood ? 'completed' : 'partial';
  s.batch.completedAt = s.t;
  s.status = 'completed';
  for (const id of STATION_IDS) s.stations[id].status = 'idle';
  emit(s, 'BATCH_COMPLETED', 'info', `Batch ${s.batch.id} ${s.batch.status}: ${shipped} good units shipped of ${s.batch.committedGood} committed`, {
    payload: { shipped, status: s.batch.status },
  });
  emit(s, 'SESSION_COMPLETED', 'info', `Run ${s.runId} completed at ${Math.round(s.t)} s virtual`);
}

/* ---------------------------------------------------------------- faults */

function raiseFault(s: Session, code: FaultCode, actor: Role | 'engine', source: Fault['source'], injected: boolean): CommandResult {
  const def = FAULT_DEF[code];
  if (!def) return { ok: false, reason: `Unknown fault code ${code}` };
  if (s.faults.some((f) => f.code === code && isOpenFault(f))) return { ok: false, reason: `${code} is already active` };
  if (def.kind === 'stop') {
    const other = stopFault(s, def.station);
    if (other) return { ok: false, reason: `${STATION_META[def.station].name} already latched by ${other.code}; resolve it first` };
  }
  const st = s.stations[def.station];
  const f: Fault = {
    id: nextId(s, 'F', 4, 2000),
    code,
    station: def.station,
    componentId: def.componentId,
    severity: def.severity,
    kind: def.kind,
    status: 'active',
    raisedAt: s.t,
    acknowledgedAt: null,
    resolvedAt: null,
    recoveredAt: null,
    workOrderId: null,
    source,
    affectedUnitId: st.current?.unitId ?? null,
    note: def.effect,
  };
  s.faults.push(f);
  if (def.kind === 'stop' && st.current && !st.current.done && st.current.finishAt !== null) {
    st.current.remaining = r6(st.current.finishAt - s.t);
    st.current.finishAt = null;
  }
  if (def.kind === 'material' && injected && def.material) {
    for (const m of FAULT_MATERIALS[code] ?? [def.material]) {
      const lot = s.materials[m];
      if (!lot.available) continue;
      const qty = lot.available;
      lot.negAdj += qty;
      lot.available = 0;
      emit(s, 'MATERIAL_ADJUSTED', 'warning', `${lot.name}: ${qty} written off (simulated stockout)`, {
        station: def.station,
        actor,
        source: source === 'engine' ? 'engine' : source,
        payload: { material: m, lotId: lot.lotId, qty: -qty },
      });
    }
  }
  if (code === 'QA_CAMERA_DRIFT') s.qaDrift = 0.14;
  if (code === 'QA_BARCODE_UNREADABLE') s.barcodeDegraded = true;
  emit(s, 'FAULT_RAISED', def.severity, `${code} on ${def.componentId}: ${def.title}`, {
    station: def.station,
    unit: f.affectedUnitId,
    actor,
    source: source === 'engine' ? 'engine' : source,
    payload: { faultId: f.id, code, componentId: def.componentId, kind: def.kind, remainingCycleSec: st.current?.remaining ?? null },
  });
  return { ok: true };
}

function resolveFault(s: Session, f: Fault, actor: Role | 'engine', how: string) {
  f.status = 'resolved';
  f.resolvedAt = s.t;
  if (f.code === 'QA_CAMERA_DRIFT') s.qaDrift = 0;
  if (f.code === 'QA_BARCODE_UNREADABLE') s.barcodeDegraded = false;
  s.stations[f.station].pendingRecoveryFaultId = f.id;
  emit(s, 'FAULT_RESOLVED', 'info', `${f.code} resolved (${how})`, {
    station: f.station,
    actor,
    source: actor === 'engine' ? 'engine' : 'user',
    payload: { faultId: f.id, code: f.code, resolution: how },
  });
  if (f.code === 'QA_CAMERA_DRIFT') bumpRule(s, actor, 'Camera recalibrated');
}

function bumpRule(s: Session, actor: Role | 'engine', why: string) {
  const prev = s.qaRule.version;
  const minor = Number(prev.split('.').pop()) + 1;
  const q = s.config.qa;
  s.qaRule = { version: `QC-STD-1.${minor}`, weightMin: q.weightMin, weightMax: q.weightMax, visualMax: q.visualMax };
  emit(s, 'QA_RULE_VERSION_CHANGED', 'info', `QA rule ${prev} → ${s.qaRule.version} (${why}); applies from the next unit`, {
    station: 'qa',
    actor,
    source: actor === 'engine' ? 'engine' : 'user',
    payload: { from: prev, to: s.qaRule.version, rule: s.qaRule },
  });
}

/* ---------------------------------------------------------------- commands */

/** Scenario scripts may reference the latest fault of a code as `@CODE`. */
function findFault(s: Session, ref: string): Fault | undefined {
  if (ref.startsWith('@')) {
    const code = ref.slice(1);
    for (let i = s.faults.length - 1; i >= 0; i--) if (s.faults[i].code === code) return s.faults[i];
    return undefined;
  }
  return s.faults.find((x) => x.id === ref);
}

function findWorkOrder(s: Session, ref: string) {
  if (ref.startsWith('@')) {
    const f = findFault(s, ref);
    return s.workOrders.find((w) => w.id === f?.workOrderId);
  }
  return s.workOrders.find((w) => w.id === ref);
}

function handle(s: Session, cmd: Command, actor: Role, source: 'user' | 'scenario'): CommandResult {
  const ev = { actor, source } as const;
  switch (cmd.kind) {
    case 'START': {
      if (s.status !== 'ready') return { ok: false, reason: 'Run already started' };
      s.status = 'running';
      s.batch.status = 'released';
      s.batch.releasedAt = s.t;
      emit(s, 'SESSION_STARTED', 'info', `Simulation started for ${s.batch.id}`, ev);
      emit(s, 'BATCH_RELEASED', 'info', `Batch ${s.batch.id} released: ${s.batch.planned} planned inputs, ${s.batch.committedGood} committed good`, ev);
      push(s, 'GATE', s.t + s.config.dispatch.dispatchCadenceSec);
      push(s, 'SAMPLE', s.t + 30);
      return { ok: true };
    }
    case 'PAUSE':
      if (s.status !== 'running') return { ok: false, reason: 'Line is not running' };
      s.status = 'paused';
      emit(s, 'SESSION_PAUSED', 'info', 'Simulation paused — virtual clock and energy frozen', ev);
      return { ok: true };
    case 'RESUME':
      if (s.status !== 'paused') return { ok: false, reason: 'Line is not paused' };
      s.status = 'running';
      emit(s, 'SESSION_RESUMED', 'info', 'Simulation resumed', ev);
      return { ok: true };
    case 'SET_SPEED':
      if (![1, 2, 5, 10, 20].includes(cmd.speed)) return { ok: false, reason: 'Unsupported speed' };
      if (cmd.speed === s.speed) return { ok: false, reason: 'Speed unchanged' };
      s.speed = cmd.speed;
      emit(s, 'SPEED_CHANGED', 'info', `Simulation speed ${cmd.speed}×`, { ...ev, payload: { speed: cmd.speed } });
      return { ok: true };
    case 'INJECT_FAULT':
      if (s.status === 'completed') return { ok: false, reason: 'Run is complete' };
      return raiseFault(s, cmd.code, actor, source, true);
    case 'ACK_FAULT': {
      const f = findFault(s, cmd.faultId);
      if (!f) return { ok: false, reason: 'Fault not found' };
      if (f.status !== 'active') return { ok: false, reason: `Fault is ${f.status}, not active` };
      f.status = 'acknowledged';
      f.acknowledgedAt = s.t;
      emit(s, 'FAULT_ACKNOWLEDGED', 'info', `${f.code} acknowledged — acknowledging is not resolving`, {
        ...ev,
        station: f.station,
        payload: { faultId: f.id },
      });
      return { ok: true };
    }
    case 'CREATE_WORK_ORDER': {
      const f = findFault(s, cmd.faultId);
      if (!f || !isOpenFault(f)) return { ok: false, reason: 'No open fault to repair' };
      if (f.kind === 'material') return { ok: false, reason: 'Material faults resolve by receiving material' };
      if (f.workOrderId) return { ok: false, reason: `Work order ${f.workOrderId} already exists` };
      if (f.status === 'active') return { ok: false, reason: 'Acknowledge the fault first' };
      const def = FAULT_DEF[f.code];
      const wo = {
        id: nextId(s, 'WO', 4, 5100),
        assetId: f.componentId,
        station: f.station,
        relatedFaultId: f.id,
        priority: f.severity === 'critical' ? ('P1' as const) : ('P2' as const),
        description: `${def.title} — ${def.recovery}`,
        reporter: actor,
        assignedRole: 'technician' as Role,
        status: 'open' as const,
        createdAt: s.t,
        startedAt: null,
        resolvedAt: null,
        steps: def.steps,
        simulated: true as const,
      };
      s.workOrders.push(wo);
      f.workOrderId = wo.id;
      emit(s, 'WORK_ORDER_CREATED', 'info', `${wo.id} created for ${f.code} on ${f.componentId}`, {
        ...ev,
        station: f.station,
        payload: { workOrderId: wo.id, faultId: f.id, priority: wo.priority },
      });
      return { ok: true };
    }
    case 'START_WORK_ORDER': {
      const wo = findWorkOrder(s, cmd.workOrderId);
      if (!wo) return { ok: false, reason: 'Work order not found' };
      if (wo.status !== 'open') return { ok: false, reason: `Work order is ${wo.status}` };
      const f = s.faults.find((x) => x.id === wo.relatedFaultId);
      if (f && f.kind === 'stop' && s.status === 'running') return { ok: false, reason: 'Pause the line before repair (simulated safety step)' };
      wo.status = 'inProgress';
      wo.startedAt = s.t;
      if (f && isOpenFault(f)) f.status = 'repairInProgress';
      emit(s, 'WORK_ORDER_STARTED', 'info', `${wo.id} in progress on ${wo.assetId}`, {
        ...ev,
        station: wo.station,
        payload: { workOrderId: wo.id },
      });
      return { ok: true };
    }
    case 'RESOLVE_FAULT': {
      const f = findFault(s, cmd.faultId);
      if (!f) return { ok: false, reason: 'Fault not found' };
      if (!isOpenFault(f)) return { ok: false, reason: 'Fault already resolved' };
      if (f.kind === 'material') return { ok: false, reason: 'Receive material to resolve this fault' };
      const wo = s.workOrders.find((w) => w.id === f.workOrderId);
      if (!wo) return { ok: false, reason: 'Create a work order first' };
      if (wo.status !== 'inProgress') return { ok: false, reason: 'Start the work order first' };
      if (f.kind === 'stop' && s.status === 'running') return { ok: false, reason: 'Pause the line first' };
      resolveFault(s, f, actor, FAULT_DEF[f.code].recovery);
      wo.status = 'closed';
      wo.resolvedAt = s.t;
      emit(s, 'WORK_ORDER_COMPLETED', 'info', `${wo.id} verified and closed`, {
        ...ev,
        station: wo.station,
        payload: { workOrderId: wo.id, faultId: f.id },
      });
      return { ok: true };
    }
    case 'RECEIVE_MATERIAL': {
      const lot = s.materials[cmd.material];
      if (!lot) return { ok: false, reason: 'Unknown material' };
      if (!Number.isInteger(cmd.qty) || cmd.qty < 1 || cmd.qty > 5000) return { ok: false, reason: 'Quantity must be 1–5000' };
      lot.receipts += cmd.qty;
      lot.available += cmd.qty;
      if (lot.available > lot.reorderPoint) lot.lowNotified = false;
      emit(s, 'MATERIAL_RECEIVED', 'info', `${cmd.qty} ${lot.name.toLowerCase()} received into ${lot.lotId}`, {
        ...ev,
        station: lot.station,
        payload: { material: lot.id, lotId: lot.lotId, qty: cmd.qty },
      });
      for (const f of s.faults) {
        const mats = FAULT_MATERIALS[f.code];
        if (isOpenFault(f) && mats && mats.every((m) => s.materials[m].available > 0)) resolveFault(s, f, actor, 'material received');
      }
      return { ok: true };
    }
    case 'APPLY_SETTINGS': {
      const schema = SETTINGS_SCHEMA[cmd.stationId];
      if (!schema) return { ok: false, reason: 'Unknown station' };
      const cfg = s.config[cmd.stationId];
      const changes: { key: string; from: unknown; to: unknown }[] = [];
      const nextCfg = { ...cfg };
      for (const [key, raw] of Object.entries(cmd.values)) {
        const def = schema.find((d) => d.key === key);
        if (!def) return { ok: false, reason: `Setting ${key} is not editable here` };
        if (!def.roles.includes(actor)) return { ok: false, reason: `${ROLE_LABEL[actor]} cannot change ${def.label}` };
        if (def.kind === 'boolean') {
          if (typeof raw !== 'boolean') return { ok: false, reason: `${def.label} must be on or off` };
        } else if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < def.min || raw > def.max) {
          return { ok: false, reason: `${def.label} must be between ${def.min} and ${def.max}` };
        } else if ((key === 'bufferIn' || key === 'bufferOut' || key === 'feedReleaseSize' || key === 'wipCap') && !Number.isInteger(raw)) {
          return { ok: false, reason: `${def.label} must be a whole number` };
        }
        if (cfg[key as keyof StationConfig] !== raw) changes.push({ key, from: cfg[key as keyof StationConfig], to: raw });
        (nextCfg as Record<string, unknown>)[key] = raw;
      }
      if (nextCfg.weightMin >= nextCfg.weightMax) return { ok: false, reason: 'Weight min must be below weight max' };
      if (!changes.length) return { ok: false, reason: 'No changes to apply' };
      s.config[cmd.stationId] = nextCfg;
      s.configVersion++;
      emit(s, 'SETTINGS_APPLIED', 'info', `${STATION_META[cmd.stationId].name} settings v${s.configVersion}: ${changes.map((c) => `${c.key} ${c.from}→${c.to}`).join(', ')}`, {
        ...ev,
        station: cmd.stationId,
        payload: { changes, configVersion: s.configVersion },
      });
      if (cmd.stationId === 'qa' && changes.some((c) => c.key === 'weightMin' || c.key === 'weightMax' || c.key === 'visualMax'))
        bumpRule(s, actor, 'thresholds changed');
      return { ok: true };
    }
    case 'CLOSE_PARTIAL_CASE': {
      const c = s.cases.find((x) => x.id === s.openCaseId);
      if (!s.awaitingPartialApproval || !c || !c.unitIds.length) return { ok: false, reason: 'No partial case awaiting approval' };
      s.awaitingPartialApproval = false;
      sealCase(s, c.id, true);
      return { ok: true };
    }
  }
}

export function dispatchCommand(s: Session, cmd: Command, actor: Role = 'supervisor', source: 'user' | 'scenario' = 'user'): CommandResult {
  const roles = PERMISSIONS[cmd.kind];
  let r: CommandResult;
  if (!roles?.includes(actor)) r = { ok: false, reason: `${ROLE_LABEL[actor]} role cannot perform this action` };
  else r = handle(s, cmd, actor, source);
  if (r.ok) {
    s.commandLog.push({ at: s.t, command: cmd, actor });
    pump(s);
    reconcile(s);
    checkCompletion(s);
  } else {
    s.rejects.push({ at: s.t, kind: cmd.kind, reason: r.reason, actor });
    if (s.rejects.length > 200) s.rejects.shift();
  }
  return r;
}

/** Advance virtual time to `target` seconds. Paused or completed sessions do not move. */
export function advance(s: Session, target: number) {
  if (s.status !== 'running') return;
  while (s.queue.length && s.queue[0].at <= target + 1e-9) {
    const e = s.queue[0];
    if (s.status !== 'running' && e.at > s.t) break;
    s.queue.shift();
    accrue(s, e.at);
    switch (e.kind) {
      case 'CYCLE_DONE':
        completeCycle(s, e.station!, e.jobId!, e.at);
        break;
      case 'TRANSFER_DONE':
        completeTransfer(s, e.transferId!);
        break;
      case 'READY':
        if (s.stations[e.station!].wakeAt === e.at) s.stations[e.station!].wakeAt = null;
        break;
      case 'GATE':
        gate(s);
        break;
      case 'SAMPLE':
        sample(s);
        break;
      case 'COMMAND':
        dispatchCommand(s, e.command!, e.actor ?? 'supervisor', 'scenario');
        break;
    }
    pump(s);
    reconcile(s);
    checkCompletion(s);
    if ((s.status as Session['status']) === 'completed') return;
  }
  if (s.status === 'running') accrue(s, target);
}

/**
 * Headless run used by tests, scenario comparison and demo fast-forward.
 * A scripted PAUSE freezes time, so scripts must schedule their repair and RESUME at the same instant.
 */
export function runUntil(s: Session, horizon: number, step = 5) {
  if (s.status === 'ready') dispatchCommand(s, { kind: 'START' });
  while (s.t < horizon && s.status === 'running') advance(s, Math.min(horizon, s.t + step));
}
