import type {
  ConfigKey,
  FaultCode,
  FaultKind,
  MaterialId,
  Role,
  Severity,
  StationConfig,
  StationId,
} from './types';

export const ENGINE_VERSION = 'lf-engine-1.1.1';

export interface StationMeta {
  id: StationId;
  no: string;
  name: string;
  short: string;
  role: string;
}

export const STATIONS: StationMeta[] = [
  { id: 'intake', no: '01', name: 'Material Intake', short: 'Intake', role: 'Releases serialized device cores and verifies barcodes' },
  { id: 'assembly', no: '02', name: 'Assembly', short: 'Assembly', role: 'Fixtures the core, adds battery pack and leaflet, presses' },
  { id: 'robot', no: '03', name: 'Robotic Process', short: 'Robot', role: 'Six-axis arm transfers kits from assembly to inspection' },
  { id: 'qa', no: '04', name: 'Quality Check', short: 'QA', role: 'Vision, weight and barcode inspection with reject diverter' },
  { id: 'packaging', no: '05', name: 'Packaging', short: 'Packaging', role: 'Forms carton, folds flaps, seals and labels each kit' },
  { id: 'dispatch', no: '06', name: 'Dispatch', short: 'Dispatch', role: 'Packs 12 kits per case, palletizes and ships' },
];

export const STATION_META: Record<StationId, StationMeta> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
) as Record<StationId, StationMeta>;

const base: StationConfig = {
  cycleSeconds: 3,
  bufferIn: 20,
  bufferOut: 20,
  energyKW: 2,
  idleFactor: 0.25,
  transferSeconds: 0.3,
  feedReleaseSize: 10,
  wipCap: 80,
  scanConfidenceMin: 0.9,
  weightMin: 186,
  weightMax: 204,
  visualMax: 0.22,
  defectRate: 0.015,
  dispatchCadenceSec: 15,
  autoDispatch: true,
};

export const DEFAULT_CONFIG: Record<StationId, StationConfig> = {
  intake: { ...base, cycleSeconds: 2.8, bufferIn: 40, bufferOut: 30, energyKW: 1.2 },
  assembly: { ...base, cycleSeconds: 4.1, bufferIn: 30, bufferOut: 20, energyKW: 3.2 },
  robot: { ...base, cycleSeconds: 4.2, bufferIn: 20, bufferOut: 20, energyKW: 4.0 },
  qa: { ...base, cycleSeconds: 3.6, bufferIn: 20, bufferOut: 20, energyKW: 2.2 },
  packaging: { ...base, cycleSeconds: 4.5, bufferIn: 20, bufferOut: 24, energyKW: 3.8 },
  dispatch: { ...base, cycleSeconds: 2.7, bufferIn: 24, bufferOut: 60, energyKW: 1.5 },
};

export interface FieldDef {
  key: ConfigKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  kind?: 'number' | 'boolean';
  impact: string;
  roles: Role[];
}

const ENG: Role[] = ['supervisor', 'engineer'];
const QUAL: Role[] = ['supervisor', 'engineer', 'quality'];

const common = (cmin: number, cmax: number): FieldDef[] => [
  { key: 'cycleSeconds', label: 'Cycle time', unit: 's', min: cmin, max: cmax, step: 0.1, impact: 'Shorter cycles raise station capacity; the line is still limited by its slowest station.', roles: ENG },
  { key: 'bufferIn', label: 'Input buffer', unit: 'units', min: 4, max: 60, step: 1, impact: 'Larger buffers absorb short stops upstream but hold more WIP.', roles: ENG },
  { key: 'bufferOut', label: 'Output buffer', unit: 'units', min: 4, max: 60, step: 1, impact: 'When full, the station holds its finished unit and reports Blocked.', roles: ENG },
  { key: 'energyKW', label: 'Active power', unit: 'kW', min: 0.2, max: 8, step: 0.1, impact: 'Power draw while processing; idle draw is a fixed share of it.', roles: ENG },
];

export const SETTINGS_SCHEMA: Record<StationId, FieldDef[]> = {
  intake: [
    ...common(2, 6),
    { key: 'feedReleaseSize', label: 'Release wave', unit: 'units', min: 1, max: 20, step: 1, impact: 'Units released into the intake buffer per wave.', roles: ENG },
    { key: 'wipCap', label: 'Line WIP cap', unit: 'units', min: 20, max: 240, step: 5, impact: 'Releases pause while this many units are between intake and packaging.', roles: ENG },
    { key: 'scanConfidenceMin', label: 'Scan confidence min', unit: '', min: 0.8, max: 0.98, step: 0.01, impact: 'Reads below this confidence are retried, adding 1.2 s per retry.', roles: ENG },
  ],
  assembly: common(3, 7),
  robot: [
    ...common(3, 7),
    { key: 'transferSeconds', label: 'Conveyor transfer', unit: 's', min: 0.2, max: 3, step: 0.1, impact: 'Travel time from this station to the next.', roles: ENG },
  ],
  qa: [
    ...common(2.5, 6),
    { key: 'weightMin', label: 'Weight min', unit: 'g', min: 170, max: 195, step: 0.5, impact: 'Applies to the next inspected unit; earlier decisions are never re-evaluated.', roles: QUAL },
    { key: 'weightMax', label: 'Weight max', unit: 'g', min: 195, max: 220, step: 0.5, impact: 'Applies to the next inspected unit.', roles: QUAL },
    { key: 'visualMax', label: 'Visual score max', unit: '', min: 0.1, max: 0.4, step: 0.01, impact: 'Lower values reject more marginal kits (simulated hypothesis).', roles: QUAL },
    { key: 'defectRate', label: 'Seeded defect rate', unit: '', min: 0, max: 0.1, step: 0.005, impact: 'Simulation parameter: probability a kit leaves assembly with a latent defect.', roles: QUAL },
  ],
  packaging: common(3, 7),
  dispatch: [
    ...common(2, 5),
    { key: 'dispatchCadenceSec', label: 'Gate cadence', unit: 's', min: 5, max: 120, step: 5, impact: 'Sealed cases leave through the outbound gate at this interval.', roles: ENG },
    { key: 'autoDispatch', label: 'Auto dispatch', unit: '', min: 0, max: 1, step: 1, kind: 'boolean', impact: 'When off, sealed cases accumulate at staging.', roles: ENG },
  ],
};

export interface ComponentDef {
  id: string;
  station: StationId;
  name: string;
  kind: string;
  note: string;
}

const C = (station: StationId, id: string, name: string, kind: string, note: string): ComponentDef => ({ id, station, name, kind, note });

export const COMPONENTS: ComponentDef[] = [
  C('intake', 'INT-TRAY-01', 'Supply tray', 'Fixture', 'Holds released device cores before the belt'),
  C('intake', 'INT-BELT-01', 'Infeed belt', 'Conveyor', 'Carries cores under the scan arch'),
  C('intake', 'INT-SCANNER-01', 'Barcode scan head', 'Sensor', 'Reads the serial on every core'),
  C('intake', 'INT-PHOTOEYE-01', 'Presence photoeye', 'Sensor', 'Confirms a core is in position'),
  C('intake', 'INT-GATE-01', 'Guide rails', 'Mechanism', 'Centres cores on the belt'),
  C('intake', 'INT-CONTROLLER-01', 'Intake controller', 'Controller', 'Release pacing and retry logic'),
  C('assembly', 'ASM-FIXTURE-01', 'Fixture nest', 'Fixture', 'Locates the core during assembly'),
  C('assembly', 'ASM-PRESS-01', 'Press head', 'Actuator', 'Seats the battery pack and closes the kit'),
  C('assembly', 'ASM-BAT-FEED-01', 'Battery feeder', 'Feeder', 'Delivers one battery pack per cycle'),
  C('assembly', 'ASM-INSERT-FEED-01', 'Leaflet feeder', 'Feeder', 'Delivers one leaflet per cycle'),
  C('assembly', 'ASM-ALIGN-01', 'Alignment jaws', 'Mechanism', 'Clamp and square the kit'),
  C('assembly', 'ASM-DRIVE-01', 'Belt drive', 'Drive', 'Indexes kits through the cell'),
  C('robot', 'ROB-BASE-01', 'Base and turntable', 'Joint J1', 'Yaw axis'),
  C('robot', 'ROB-SHOULDER-01', 'Shoulder', 'Joint J2', 'Upper link pitch'),
  C('robot', 'ROB-ELBOW-01', 'Elbow', 'Joint J3', 'Forearm pitch'),
  C('robot', 'ROB-WRIST-01', 'Wrist', 'Joint J4–J6', 'Tool orientation'),
  C('robot', 'ROB-GRIPPER-01', 'Gripper fingers', 'End effector', 'Holds the kit during transfer'),
  C('robot', 'ROB-VACUUM-01', 'Vacuum line', 'Pneumatics', 'Suction for the gripper cups'),
  C('robot', 'ROB-ENCODER-01', 'Joint encoders', 'Sensor', 'Motion tolerance monitoring'),
  C('robot', 'ROB-GUARD-01', 'Cell guard', 'Safety (sim)', 'Simulated light curtain boundary'),
  C('qa', 'QA-CAMERA-01', 'Vision camera', 'Sensor', 'Surface and insert inspection'),
  C('qa', 'QA-LENS-01', 'Lens barrel', 'Optics', 'Focus travel for the camera'),
  C('qa', 'QA-SCALE-01', 'Check-weigher', 'Sensor', 'Weighs each kit'),
  C('qa', 'QA-BARCODE-01', 'Barcode reader', 'Sensor', 'Matches label to serial'),
  C('qa', 'QA-LIGHT-01', 'Hood lighting', 'Optics', 'Diffuse lighting under the hood'),
  C('qa', 'QA-DIVERTER-01', 'Reject diverter', 'Actuator', 'Routes failed kits to the tray'),
  C('qa', 'QA-REJECT-TRAY-01', 'Reject tray', 'Fixture', 'Collects rejected kits'),
  C('qa', 'QA-CONTROLLER-01', 'QA controller', 'Controller', 'Applies the versioned rule set'),
  C('packaging', 'PKG-CARTON-MAG-01', 'Carton magazine', 'Feeder', 'Holds flat retail carton blanks'),
  C('packaging', 'PKG-FORMER-01', 'Carton former', 'Mechanism', 'Erects the carton and folds flaps'),
  C('packaging', 'PKG-SEALER-01', 'Sealing head', 'Actuator', 'Heat-seals the carton'),
  C('packaging', 'PKG-HEATER-01', 'Seal heater', 'Thermal', 'Keeps the seal bar in range'),
  C('packaging', 'PKG-LABELER-01', 'Label applicator', 'Printer', 'Prints and applies the retail label'),
  C('packaging', 'PKG-PHOTOEYE-01', 'Exit photoeye', 'Sensor', 'Detects jams at the outfeed'),
  C('packaging', 'PKG-BELT-01', 'Carton belt', 'Conveyor', 'Indexes cartons through the cell'),
  C('packaging', 'PKG-DRIVE-01', 'Belt drive', 'Drive', 'Motor for the carton belt'),
  C('dispatch', 'DSP-INFEED-01', 'Infeed belt', 'Conveyor', 'Accumulates packed kits'),
  C('dispatch', 'DSP-CASE-LOADER-01', 'Case loader', 'Mechanism', 'Places 12 kits into a shipping case'),
  C('dispatch', 'DSP-SCANNER-01', 'Manifest scanner', 'Sensor', 'Scans each case against the manifest'),
  C('dispatch', 'DSP-GATE-01', 'Outbound gate', 'Mechanism', 'Releases sealed cases'),
  C('dispatch', 'DSP-PALLETIZER-01', 'Pallet station', 'Fixture', 'Groups up to 60 cases per pallet'),
  C('dispatch', 'DSP-COUNTER-01', 'Dispatch counter', 'Controller', 'Counts confirmed shipments'),
];

export interface FaultDef {
  code: FaultCode;
  station: StationId;
  componentId: string;
  kind: FaultKind;
  severity: Severity;
  title: string;
  effect: string;
  recovery: string;
  material?: MaterialId;
  steps: string[];
}

const F = (d: FaultDef) => d;

export const FAULTS: FaultDef[] = [
  F({ code: 'INT_BAD_BARCODE', station: 'intake', componentId: 'INT-SCANNER-01', kind: 'stop', severity: 'warning', title: 'Barcode read failed', effect: 'Unit held at the scan arch; intake stops.', recovery: 'Clean the scan window and rescan.', steps: ['Pause line', 'Clean scan window', 'Rescan held unit'] }),
  F({ code: 'INT_FEED_STALL', station: 'intake', componentId: 'INT-TRAY-01', kind: 'stop', severity: 'warning', title: 'Feed roller stalled', effect: 'No new units are released.', recovery: 'Clear the feeder and restart.', steps: ['Pause line', 'Clear feeder roller', 'Verify release'] }),
  F({ code: 'ASM_PARTS_EMPTY', station: 'assembly', componentId: 'ASM-BAT-FEED-01', kind: 'material', severity: 'warning', title: 'Accessory bin empty', effect: 'Assembly waits for battery packs or leaflets.', recovery: 'Receive battery packs / leaflets.', material: 'batteryPack', steps: ['Receive material lot'] }),
  F({ code: 'ASM_MISALIGN', station: 'assembly', componentId: 'ASM-ALIGN-01', kind: 'stop', severity: 'warning', title: 'Fixture misaligned', effect: 'Cycle held in the press.', recovery: 'Reseat fixture and calibrate jaws.', steps: ['Pause line', 'Reseat fixture', 'Run jaw calibration'] }),
  F({ code: 'ROB_VACUUM_LOSS', station: 'robot', componentId: 'ROB-VACUUM-01', kind: 'stop', severity: 'critical', title: 'Vacuum pressure lost', effect: 'Current pick held; no transfer to QA.', recovery: 'Restore vacuum and verify gripper.', steps: ['Pause line', 'Check vacuum line and cups', 'Verify grip test'] }),
  F({ code: 'ROB_JOINT_TIMEOUT', station: 'robot', componentId: 'ROB-ENCODER-01', kind: 'stop', severity: 'critical', title: 'Joint motion timeout', effect: 'Arm parked at safe rest.', recovery: 'Home the arm and restart.', steps: ['Pause line', 'Home all axes', 'Verify encoders'] }),
  F({ code: 'QA_CAMERA_DRIFT', station: 'qa', componentId: 'QA-CAMERA-01', kind: 'quality', severity: 'warning', title: 'Vision calibration drift', effect: 'Visual scores rise; more kits are rejected.', recovery: 'Recalibrate; applies from the next unit.', steps: ['Run calibration target', 'Confirm offset', 'Publish new rule version'] }),
  F({ code: 'QA_BARCODE_UNREADABLE', station: 'qa', componentId: 'QA-BARCODE-01', kind: 'quality', severity: 'warning', title: 'Label reader timeouts', effect: 'Some kits rejected as label mismatch.', recovery: 'Inspect the reader and retry policy.', steps: ['Clean reader window', 'Verify read rate'] }),
  F({ code: 'QA_SCALE_ERROR', station: 'qa', componentId: 'QA-SCALE-01', kind: 'stop', severity: 'warning', title: 'Scale confidence low', effect: 'Measurement unavailable; QA holds.', recovery: 'Zero and calibrate the scale.', steps: ['Pause line', 'Zero scale', 'Check reference weight'] }),
  F({ code: 'PKG_JAM', station: 'packaging', componentId: 'PKG-PHOTOEYE-01', kind: 'stop', severity: 'critical', title: 'Carton jam at outfeed', effect: 'Sealer stops; upstream fills with backpressure.', recovery: 'Pause, clear the jam, reset the photoeye.', steps: ['Pause line', 'Clear jammed carton', 'Reset photoeye'] }),
  F({ code: 'PKG_CARTON_OUT', station: 'packaging', componentId: 'PKG-CARTON-MAG-01', kind: 'material', severity: 'warning', title: 'Carton magazine empty', effect: 'Packaging cannot start a cycle.', recovery: 'Receive retail cartons.', material: 'retailCarton', steps: ['Receive material lot'] }),
  F({ code: 'PKG_LABEL_OUT', station: 'packaging', componentId: 'PKG-LABELER-01', kind: 'material', severity: 'warning', title: 'Label roll empty', effect: 'Good units wait at packaging.', recovery: 'Restock labels.', material: 'label', steps: ['Receive material lot'] }),
  F({ code: 'PKG_SEAL_TEMP_LOW', station: 'packaging', componentId: 'PKG-HEATER-01', kind: 'stop', severity: 'warning', title: 'Seal temperature low', effect: 'Carton held until the heater recovers.', recovery: 'Warm-up cycle and heater check.', steps: ['Pause line', 'Run warm-up', 'Verify seal bar temperature'] }),
  F({ code: 'DSP_GATE_OFFLINE', station: 'dispatch', componentId: 'DSP-GATE-01', kind: 'stop', severity: 'warning', title: 'Outbound gate offline', effect: 'Cases accumulate; nothing ships.', recovery: 'Reset the gate.', steps: ['Pause line', 'Reset gate controller', 'Release staged cases'] }),
  F({ code: 'DSP_SCANNER_FAIL', station: 'dispatch', componentId: 'DSP-SCANNER-01', kind: 'stop', severity: 'warning', title: 'Manifest scanner failed', effect: 'Case held; no dispatch events.', recovery: 'Rescan or replace the sensor.', steps: ['Pause line', 'Replace scanner head', 'Rescan held case'] }),
];

export const FAULT_DEF: Record<FaultCode, FaultDef> = Object.fromEntries(FAULTS.map((f) => [f.code, f])) as Record<
  FaultCode,
  FaultDef
>;

export interface MaterialDef {
  id: MaterialId;
  name: string;
  unit: string;
  station: StationId;
  opening: number;
  reorderPoint: number;
  lotPrefix: string;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'deviceCore', name: 'Device cores', unit: 'pcs', station: 'intake', opening: 2400, reorderPoint: 100, lotPrefix: 'DC' },
  { id: 'batteryPack', name: 'Battery packs', unit: 'pcs', station: 'assembly', opening: 2600, reorderPoint: 150, lotPrefix: 'BP' },
  { id: 'leaflet', name: 'Leaflets', unit: 'pcs', station: 'assembly', opening: 2600, reorderPoint: 150, lotPrefix: 'LF' },
  { id: 'retailCarton', name: 'Retail cartons', unit: 'pcs', station: 'packaging', opening: 2600, reorderPoint: 150, lotPrefix: 'RC' },
  { id: 'seal', name: 'Seal strips', unit: 'pcs', station: 'packaging', opening: 2600, reorderPoint: 150, lotPrefix: 'SS' },
  { id: 'label', name: 'Retail labels', unit: 'pcs', station: 'packaging', opening: 2600, reorderPoint: 150, lotPrefix: 'LB' },
  { id: 'shippingCase', name: 'Shipping cases', unit: 'pcs', station: 'dispatch', opening: 220, reorderPoint: 20, lotPrefix: 'SC' },
];

export const CASE_SIZE = 12;
export const PALLET_CASES = 60;

export const PERMISSIONS: Record<string, Role[]> = {
  START: ['supervisor', 'operator', 'engineer', 'technician'],
  PAUSE: ['supervisor', 'operator', 'engineer', 'technician', 'quality'],
  RESUME: ['supervisor', 'operator', 'engineer', 'technician'],
  SET_SPEED: ['supervisor', 'operator', 'engineer', 'technician', 'quality'],
  INJECT_FAULT: ['supervisor', 'operator', 'engineer', 'technician'],
  ACK_FAULT: ['supervisor', 'operator', 'technician', 'quality'],
  CREATE_WORK_ORDER: ['supervisor', 'operator', 'technician'],
  START_WORK_ORDER: ['supervisor', 'technician'],
  RESOLVE_FAULT: ['supervisor', 'technician'],
  RECEIVE_MATERIAL: ['supervisor', 'operator'],
  APPLY_SETTINGS: ['supervisor', 'engineer', 'quality'],
  CLOSE_PARTIAL_CASE: ['supervisor', 'operator'],
};

export const ROLE_LABEL: Record<Role, string> = {
  supervisor: 'Line supervisor',
  operator: 'Operator',
  technician: 'Maintenance technician',
  engineer: 'Process engineer',
  quality: 'Quality lead',
  viewer: 'Viewer',
};
