export const STATION_IDS = ['intake', 'assembly', 'robot', 'qa', 'packaging', 'dispatch'] as const;
export type StationId = (typeof STATION_IDS)[number];

export type StationStatus = 'idle' | 'processing' | 'starved' | 'blocked' | 'faulted' | 'maintenance' | 'paused';
export type SessionStatus = 'ready' | 'running' | 'paused' | 'completed' | 'halted';
export type BatchStatus = 'planned' | 'released' | 'inProgress' | 'completed' | 'partial' | 'cancelled';
export type UnitState =
  | 'unreleased'
  | 'queue'
  | 'processing'
  | 'transfer'
  | 'rejected'
  | 'acceptedAwaitingPackaging'
  | 'packed'
  | 'dispatched';
export type Speed = 1 | 2 | 5 | 10 | 20;
export const SPEEDS: Speed[] = [1, 2, 5, 10, 20];

export type Role = 'supervisor' | 'operator' | 'technician' | 'engineer' | 'quality' | 'viewer';

export type DefectCode = 'MISSING_INSERT' | 'WEIGHT_OUT_OF_RANGE' | 'LABEL_ID_MISMATCH' | 'SURFACE_DEFECT';

export type FaultCode =
  | 'INT_BAD_BARCODE'
  | 'INT_FEED_STALL'
  | 'ASM_PARTS_EMPTY'
  | 'ASM_MISALIGN'
  | 'ROB_VACUUM_LOSS'
  | 'ROB_JOINT_TIMEOUT'
  | 'QA_CAMERA_DRIFT'
  | 'QA_BARCODE_UNREADABLE'
  | 'QA_SCALE_ERROR'
  | 'PKG_JAM'
  | 'PKG_CARTON_OUT'
  | 'PKG_LABEL_OUT'
  | 'PKG_SEAL_TEMP_LOW'
  | 'DSP_GATE_OFFLINE'
  | 'DSP_SCANNER_FAIL';

export type FaultKind = 'stop' | 'material' | 'quality';
export type Severity = 'info' | 'warning' | 'critical';

export type MaterialId = 'deviceCore' | 'batteryPack' | 'leaflet' | 'retailCarton' | 'seal' | 'label' | 'shippingCase';

export type UnitSlot = 'none' | 'in' | 'machine' | 'out' | 'transfer' | 'tray' | 'staged' | 'shipped';

/** 1-D belt position within the unit's current region (see conveyor.ts). */
export interface Track {
  pos: number;
  at: number;
  target: number;
}

export interface Unit {
  id: string;
  serial: string;
  idx: number;
  state: UnitState;
  station: StationId | null;
  slot: UnitSlot;
  latent: DefectCode | null;
  qaPassed: boolean;
  packaged: boolean;
  inspectionId: string | null;
  caseId: string | null;
  shipmentId: string | null;
  releasedAt: number | null;
  rejectedAt: number | null;
  dispatchedAt: number | null;
  scanAttempts: number;
  track: Track | null;
}

export interface Job {
  jobId: number;
  unitId: string;
  startAt: number;
  duration: number;
  remaining: number;
  finishAt: number | null;
  done: boolean;
  reserved: MaterialId[];
  /** Seconds the unit needs to travel from where it was to the work point. */
  travel: number;
}

export interface Transfer {
  transferId: string;
  unitId: string;
  from: StationId;
  to: StationId;
  startAt: number;
  finishAt: number;
  /** Receiver input slot reserved at departure. */
  slot: number;
}

export interface StationConfig {
  cycleSeconds: number;
  bufferIn: number;
  bufferOut: number;
  energyKW: number;
  idleFactor: number;
  transferSeconds: number;
  feedReleaseSize: number;
  wipCap: number;
  scanConfidenceMin: number;
  weightMin: number;
  weightMax: number;
  visualMax: number;
  defectRate: number;
  dispatchCadenceSec: number;
  autoDispatch: boolean;
}

export type ConfigKey = keyof StationConfig;

export interface StationState {
  id: StationId;
  inQ: string[];
  outQ: string[];
  incoming: number;
  current: Job | null;
  status: StationStatus;
  blockReason: string | null;
  started: number;
  completed: number;
  lastCompletedAt: number | null;
  timeIn: Record<StationStatus, number>;
  energyKWh: number;
  recentCycles: number[];
  completionTimes: number[];
  pendingRecoveryFaultId: string | null;
  blockedSince: number | null;
  lastBlockedEventAt: number;
  /** Pending wake-up for the out-port head's arrival. */
  wakeAt: number | null;
}

export interface MaterialLot {
  id: MaterialId;
  lotId: string;
  name: string;
  unit: string;
  station: StationId;
  opening: number;
  receipts: number;
  available: number;
  reserved: number;
  consumed: number;
  scrapped: number;
  negAdj: number;
  reorderPoint: number;
  lowNotified: boolean;
}

export type FaultStatus = 'active' | 'acknowledged' | 'repairInProgress' | 'resolved' | 'recovered';

export interface Fault {
  id: string;
  code: FaultCode;
  station: StationId;
  componentId: string;
  severity: Severity;
  kind: FaultKind;
  status: FaultStatus;
  raisedAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  recoveredAt: number | null;
  workOrderId: string | null;
  source: 'scenario' | 'user' | 'engine';
  affectedUnitId: string | null;
  note: string;
}

export type WorkOrderStatus = 'open' | 'inProgress' | 'verified' | 'closed' | 'cancelled';

export interface WorkOrder {
  id: string;
  assetId: string;
  station: StationId;
  relatedFaultId: string | null;
  priority: 'P1' | 'P2' | 'P3';
  description: string;
  reporter: Role;
  assignedRole: Role;
  status: WorkOrderStatus;
  createdAt: number;
  startedAt: number | null;
  resolvedAt: number | null;
  steps: string[];
  simulated: true;
}

export interface Inspection {
  id: string;
  unitId: string;
  serial: string;
  at: number;
  ruleVersion: string;
  weight: number;
  visualScore: number;
  barcodeValid: boolean;
  insertDetected: boolean;
  result: 'pass' | 'reject';
  codes: DefectCode[];
}

export interface ShippingCase {
  id: string;
  unitIds: string[];
  status: 'open' | 'sealed' | 'shipped';
  partial: boolean;
  openedAt: number;
  sealedAt: number | null;
  palletId: string | null;
  shipmentId: string | null;
}

export interface Pallet {
  id: string;
  caseIds: string[];
  status: 'open' | 'closed';
  openedAt: number;
  closedAt: number | null;
}

export interface Shipment {
  id: string;
  at: number;
  caseIds: string[];
  units: number;
}

export interface QaRule {
  version: string;
  weightMin: number;
  weightMax: number;
  visualMax: number;
}

export interface Batch {
  id: string;
  sku: string;
  skuName: string;
  planned: number;
  committedGood: number;
  status: BatchStatus;
  releasedAt: number | null;
  completedAt: number | null;
  committedReachedAt: number | null;
}

export type EventType =
  | 'RUN_CREATED'
  | 'SESSION_STARTED'
  | 'SESSION_PAUSED'
  | 'SESSION_RESUMED'
  | 'SESSION_COMPLETED'
  | 'SPEED_CHANGED'
  | 'BATCH_RELEASED'
  | 'BATCH_COMMITTED_REACHED'
  | 'BATCH_COMPLETED'
  | 'UNIT_RELEASED'
  | 'INTAKE_SCAN_RETRY'
  | 'STATION_CYCLE_STARTED'
  | 'STATION_CYCLE_COMPLETED'
  | 'STATION_BLOCKED'
  | 'STATION_UNBLOCKED'
  | 'STATION_RECOVERED'
  | 'QA_INSPECTION_PASSED'
  | 'QA_INSPECTION_REJECTED'
  | 'QA_RULE_VERSION_CHANGED'
  | 'MATERIAL_CONSUMED'
  | 'MATERIAL_RECEIVED'
  | 'MATERIAL_ADJUSTED'
  | 'MATERIAL_LOW'
  | 'CASE_OPENED'
  | 'CASE_SEALED'
  | 'PALLET_OPENED'
  | 'PALLET_CLOSED'
  | 'SHIPMENT_DISPATCHED'
  | 'FAULT_RAISED'
  | 'FAULT_ACKNOWLEDGED'
  | 'FAULT_RESOLVED'
  | 'WORK_ORDER_CREATED'
  | 'WORK_ORDER_STARTED'
  | 'WORK_ORDER_COMPLETED'
  | 'SETTINGS_APPLIED'
  | 'TRANSFER_RESERVED'
  | 'TRANSFER_STARTED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_CANCELLED';

export interface DomainEvent {
  id: string;
  seq: number;
  runId: string;
  virtualAt: number;
  type: EventType;
  severity: Severity;
  stationId: StationId | null;
  batchId: string;
  unitId: string | null;
  actor: Role | 'engine';
  source: 'engine' | 'user' | 'scenario';
  message: string;
  payload: Record<string, unknown>;
}

export type Command =
  | { kind: 'START' }
  | { kind: 'PAUSE' }
  | { kind: 'RESUME' }
  | { kind: 'SET_SPEED'; speed: Speed }
  | { kind: 'INJECT_FAULT'; code: FaultCode }
  | { kind: 'ACK_FAULT'; faultId: string }
  | { kind: 'CREATE_WORK_ORDER'; faultId: string }
  | { kind: 'START_WORK_ORDER'; workOrderId: string }
  | { kind: 'RESOLVE_FAULT'; faultId: string }
  | { kind: 'RECEIVE_MATERIAL'; material: MaterialId; qty: number }
  | { kind: 'APPLY_SETTINGS'; stationId: StationId; values: Partial<StationConfig> }
  | { kind: 'CLOSE_PARTIAL_CASE' };

export interface CommandReject {
  at: number;
  kind: Command['kind'];
  reason: string;
  actor: Role;
}

export type CommandResult = { ok: true } | { ok: false; reason: string };

export interface ScheduledCommand {
  at: number;
  command: Command;
  actor?: Role;
}

export type QueueKind = 'CYCLE_DONE' | 'TRANSFER_DONE' | 'READY' | 'GATE' | 'SAMPLE' | 'COMMAND';

export interface QueueItem {
  at: number;
  prio: number;
  seq: number;
  kind: QueueKind;
  station?: StationId;
  jobId?: number;
  unitId?: string;
  transferId?: string;
  command?: Command;
  actor?: Role;
}

export interface Sample {
  t: number;
  shipped: number;
  rejected: number;
  inspected: number;
  wip: number;
  energyKWh: number;
  throughput: number;
  statuses: Record<StationId, StationStatus>;
}

export interface Session {
  engineVersion: string;
  runId: string;
  scenarioId: string;
  seed: number;
  rng: number;
  status: SessionStatus;
  speed: Speed;
  t: number;
  seq: number;
  qseq: number;
  jobSeq: number;
  idSeq: Record<string, number>;
  batch: Batch;
  units: Unit[];
  releaseCursor: number;
  lineWip: number;
  stations: Record<StationId, StationState>;
  config: Record<StationId, StationConfig>;
  configVersion: number;
  qaRule: QaRule;
  qaDrift: number;
  barcodeDegraded: boolean;
  materials: Record<MaterialId, MaterialLot>;
  transfers: Transfer[];
  rejectTray: string[];
  cases: ShippingCase[];
  openCaseId: string | null;
  pallets: Pallet[];
  openPalletId: string | null;
  shipments: Shipment[];
  faults: Fault[];
  workOrders: WorkOrder[];
  inspections: Inspection[];
  events: DomainEvent[];
  queue: QueueItem[];
  samples: Sample[];
  commandLog: ScheduledCommand[];
  rejects: CommandReject[];
  awaitingPartialApproval: boolean;
}
