/**
 * Guided demo and presentation mode.
 *
 * Every scene is rebuilt from the same seed by a fixed, headless command script, so Next, Back and
 * a reload all land on identical states. Nothing here fakes data: the scenes are the engine's own output.
 */
import { useSyncExternalStore } from 'react';
import { experiment } from '../app/experiment';
import { store } from '../app/store';
import { focusComponent, focusStation } from '../camera/commands';
import { camera } from '../camera/controller';
import { isOpenFault } from '../domain/engine';
import type { Speed } from '../domain/types';
import { nextUnitAt } from '../features/follow-product/FollowCard';
import { enterMode } from '../workspace/ModeBar';
import { workspace } from '../workspace/workspaceStore';

export const DEMO_SEED = 842;
export const DEMO_RUN = 'RUN-DEMO';
/** Virtual seconds into the run at which each scene starts. */
const T_FLOWING = 150;
const T_INSPECT = 210;
const T_JAM = 240;
const JAM_RUN = 45;
const RECOVER_RUN = 120;

export interface Scene {
  title: string;
  /** One or two short sentences; the canvas carries the rest. */
  body: () => string;
  enter: () => void;
}

function base(t: number) {
  experiment.discard();
  store.reset({ seed: DEMO_SEED, runId: DEMO_RUN });
  store.fastForward(t);
}
function run(speed: Speed) {
  if (store.session.speed !== speed) store.command({ kind: 'SET_SPEED', speed });
  if (store.session.status === 'paused') store.command({ kind: 'RESUME' });
}
function calm() {
  workspace.openTool(null);
  workspace.setMode('explore');
  workspace.setLayer('flow');
  store.setFollow(null);
}
const jam = () => store.session.faults.find((f) => f.code === 'PKG_JAM' && isOpenFault(f));

function jamScript() {
  base(T_JAM);
  experiment.capture(true);
  store.command({ kind: 'INJECT_FAULT', code: 'PKG_JAM' });
  store.fastForward(JAM_RUN);
}

/** The same guarded steps the fault card offers: acknowledge, work order, pause, repair, verify. */
function recover(): boolean {
  const f = jam();
  if (!f) return true;
  const ok = (r: { ok: boolean }) => r.ok;
  if (!ok(store.command({ kind: 'ACK_FAULT', faultId: f.id }))) return false;
  if (!ok(store.command({ kind: 'CREATE_WORK_ORDER', faultId: f.id }))) return false;
  if (store.session.status === 'running') store.command({ kind: 'PAUSE' });
  const wo = store.session.workOrders.find((w) => w.relatedFaultId === f.id);
  if (!wo || !ok(store.command({ kind: 'START_WORK_ORDER', workOrderId: wo.id }))) return false;
  return ok(store.command({ kind: 'RESOLVE_FAULT', faultId: f.id }));
}

const serial = (id: string | null) => store.session.units.find((u) => u.id === id)?.serial ?? 'a kit';

export const SCENES: Scene[] = [
  {
    title: 'The whole line',
    body: () => 'Six machines, one flow. Kits enter at Goods in and leave at Shipped. Follow one kit from intake to dispatch.',
    enter: () => {
      base(T_FLOWING);
      calm();
      workspace.select(null);
      camera.fit();
      run(5);
    },
  },
  {
    title: 'Follow a serialized kit',
    body: () => `The camera follows ${serial(store.follow)}. The card lists each stage it has passed, with virtual times.`,
    enter: () => {
      base(T_FLOWING);
      calm();
      workspace.select(null);
      const s = store.session;
      const unit = nextUnitAt(s, 'assembly') ?? nextUnitAt(s, 'intake');
      store.setFollow(unit);
      run(2);
    },
  },
  {
    title: 'Inspect a machine',
    body: () => 'Robot selected and its gripper highlighted on the drawing. Parts shows each component; Activity holds the recent events.',
    enter: () => {
      base(T_INSPECT);
      calm();
      workspace.select('robot', { inspector: true });
      workspace.selectComponent('robot', 'ROB-GRIPPER-01');
      focusComponent('robot', 'ROB-GRIPPER-01');
      run(1);
    },
  },
  {
    title: 'Introduce a fault',
    body: () => 'A baseline was captured, then a carton jam stopped Packaging. Watch its input queue fill and the shipped rate slow; the fault card names the part.',
    enter: () => {
      jamScript();
      store.setFollow(null);
      workspace.openTool(null);
      enterMode('experiment');
      workspace.select('packaging', { inspector: true });
      workspace.setInspectorTab('overview');
      focusStation('packaging');
      run(5);
    },
  },
  {
    title: 'Recover and decide',
    body: () =>
      demo.get().note ??
      `Recovered with the fault card's steps, then ran ${RECOVER_RUN / 60} virtual minutes. The Experiment panel compares this run with the no-jam baseline at the same time.`,
    enter: () => {
      jamScript();
      store.setFollow(null);
      workspace.openTool(null);
      const ok = recover();
      demo.setNote(ok ? null : 'Recovery needs the supervisor or technician role (Settings). The fault is still open.');
      store.fastForward(RECOVER_RUN);
      experiment.compare();
      enterMode('experiment');
      workspace.select('packaging', { inspector: true });
      workspace.setInspectorTab('activity');
      focusStation('packaging');
    },
  },
];

interface DemoState {
  /** -1: intro card; 0..4: scene; null: tour closed. */
  step: number | null;
  presenting: boolean;
  note: string | null;
}

class DemoStore {
  private state: DemoState = { step: null, presenting: false, note: null };
  private ls = new Set<() => void>();
  subscribe = (l: () => void) => {
    this.ls.add(l);
    return () => void this.ls.delete(l);
  };
  get = () => this.state;
  private set(patch: Partial<DemoState>) {
    this.state = { ...this.state, ...patch };
    this.ls.forEach((l) => l());
  }

  intro() {
    this.set({ step: -1 });
  }
  go(step: number) {
    const i = Math.max(0, Math.min(SCENES.length - 1, step));
    this.set({ step: i, note: null });
    SCENES[i].enter();
    this.set({});
  }
  next() {
    const s = this.state.step ?? -1;
    if (s < SCENES.length - 1) this.go(s + 1);
  }
  back() {
    const s = this.state.step ?? 0;
    if (s > 0) this.go(s - 1);
  }
  /** Close the tour and leave the line exactly as it is. */
  skip() {
    this.set({ step: null, note: null });
  }
  /** Close the tour and return to a calm overview; the run keeps its state. */
  exit() {
    this.set({ step: null, note: null });
    calm();
    workspace.select(null);
    camera.fit();
  }
  setNote(note: string | null) {
    this.set({ note });
  }
  setPresenting(on: boolean) {
    this.set({ presenting: on });
  }
}

export const demo = new DemoStore();

export function useDemo() {
  return useSyncExternalStore(demo.subscribe, demo.get);
}
