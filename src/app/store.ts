import { useSyncExternalStore } from 'react';
import { ENGINE_VERSION } from '../domain/config';
import { advance, createSession, dispatchCommand, type CreateOptions } from '../domain/engine';
import { SCENARIOS } from '../domain/scenarios';
import type { Command, CommandResult, Role, Session } from '../domain/types';
import { loadSession, pref, saveSession, setPref } from './persist';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

type L = () => void;
/** A visual animation driven by the shared loop; returns true while it still moves. */
export type Stepper = (dt: number) => boolean;

class SimStore {
  session: Session = createSession();
  role: Role = pref<Role>('role', 'supervisor');
  frame = 0;
  ui = 0;
  toasts: Toast[] = [];
  savedAt: string | null = null;
  hydrated = false;
  /** Unit the canvas camera follows (Follow Product). */
  follow: string | null = null;
  /** Recent frame intervals in ms, for the dev performance readout. */
  frameMs: number[] = [];
  private steppers = new Set<Stepper>();
  private frameL = new Set<L>();
  private uiL = new Set<L>();
  private raf = 0;
  private last = 0;
  private lastUi = 0;
  private lastSave = 0;
  private toastN = 0;

  constructor() {
    if (typeof window !== 'undefined') void this.hydrate();
  }

  private async hydrate() {
    const saved = await loadSession();
    const touched = this.session.status !== 'ready' || this.session.commandLog.length > 0 || this.session.configVersion > 1;
    if (touched) {
      // Storage answered after the user had already started this run; keep theirs.
    } else if (saved && saved.session.engineVersion === ENGINE_VERSION) {
      const s = saved.session;
      if (s.status === 'running') s.status = 'paused';
      this.session = s;
      this.savedAt = saved.savedAt;
      if (s.status !== 'ready') this.toast(`Restored saved run ${s.runId} (paused at ${Math.round(s.t)} s)`, 'info');
    } else if (saved) {
      this.toast('Saved run came from an older engine version and was reset', 'info');
    }
    this.hydrated = true;
    this.bump();
  }

  subscribeFrame = (l: L) => {
    this.frameL.add(l);
    return () => this.frameL.delete(l);
  };
  subscribeUi = (l: L) => {
    this.uiL.add(l);
    return () => this.uiL.delete(l);
  };

  private emitFrame() {
    this.frame++;
    this.frameL.forEach((l) => l());
  }
  private emitUi() {
    this.ui++;
    this.uiL.forEach((l) => l());
  }
  bump() {
    this.emitFrame();
    this.emitUi();
  }

  /** The one animation loop: simulation time plus any visual steppers. */
  private kick() {
    if (this.raf || typeof requestAnimationFrame === 'undefined') return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private ensureLoop() {
    if (this.session.status === 'running') this.kick();
  }

  addStepper(f: Stepper) {
    this.steppers.add(f);
    this.kick();
    return () => {
      this.steppers.delete(f);
    };
  }

  private tick = (now: number) => {
    this.raf = 0;
    const s = this.session;
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    if (this.frameMs.push(now - this.last) > 120) this.frameMs.shift();
    this.last = now;
    let active = false;
    if (s.status === 'running') {
      active = true;
      advance(s, s.t + dt * s.speed);
      if (now - this.lastSave > 15000) {
        this.lastSave = now;
        void this.save(true);
      }
      if ((s.status as Session['status']) === 'completed') {
        this.toast(`Batch ${s.batch.id} ${s.batch.status}`, 'success');
        void this.save(true);
      }
    }
    for (const f of this.steppers) if (f(dt)) active = true;
    this.emitFrame();
    if (now - this.lastUi > 120 || s.status !== 'running') {
      this.lastUi = now;
      this.emitUi();
    }
    if (active) this.raf = requestAnimationFrame(this.tick);
  };

  setFollow(unitId: string | null) {
    this.follow = unitId;
    this.bump();
    this.kick();
  }

  /** Wake the loop for one frame so steppers pick up a new target. */
  nudge() {
    this.kick();
  }

  command(cmd: Command): CommandResult {
    const r = dispatchCommand(this.session, cmd, this.role);
    if (!r.ok) this.toast(r.reason, 'error');
    this.bump();
    this.ensureLoop();
    if (r.ok && (cmd.kind === 'PAUSE' || cmd.kind === 'RESOLVE_FAULT' || cmd.kind === 'APPLY_SETTINGS')) void this.save(true);
    return r;
  }

  setRole(role: Role) {
    this.role = role;
    setPref('role', role);
    this.emitUi();
  }

  reset(opts: CreateOptions = {}) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const runN = (Number(this.session.runId.replace(/\D/g, '')) || 0) + 1;
    this.session = createSession({ runId: `RUN-${String(runN).padStart(4, '0')}`, ...opts });
    this.follow = null;
    this.bump();
    void this.save(true);
  }

  loadScenario(id: string) {
    const sc = SCENARIOS.find((x) => x.id === id);
    if (!sc) return;
    this.reset({ ...sc.options });
    this.toast(`Scenario loaded: ${sc.title}. Press Start to run it.`, 'info');
  }

  /** Deterministically advance virtual time (headless, no frames) — used by the demo preset. */
  fastForward(seconds: number) {
    const s = this.session;
    if (s.status === 'ready') dispatchCommand(s, { kind: 'START' }, this.role);
    const wasPaused = s.status === 'paused';
    if (wasPaused) s.status = 'running';
    const target = s.t + seconds;
    while (s.t < target && s.status === 'running') advance(s, Math.min(target, s.t + 10));
    if (s.status === 'running') dispatchCommand(s, { kind: 'PAUSE' }, this.role);
    this.bump();
  }

  importSession(s: Session) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (s.status === 'running') s.status = 'paused';
    this.session = s;
    this.follow = null;
    this.bump();
    void this.save(true);
  }

  async save(quiet = false) {
    try {
      await saveSession(this.session);
      this.savedAt = new Date().toISOString();
      if (!quiet) this.toast('Snapshot saved to this browser (IndexedDB)', 'success');
    } catch {
      if (!quiet) this.toast('Could not save — storage unavailable; the run continues in memory', 'error');
    }
    this.emitUi();
  }

  toast(text: string, tone: Toast['tone'] = 'info') {
    const t = { id: ++this.toastN, text, tone };
    this.toasts = [...this.toasts.slice(-3), t];
    this.emitUi();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.emitUi();
    }, tone === 'error' ? 5200 : 3600);
  }
}

export const store = new SimStore();

/** Re-renders every animation frame while the simulation runs (canvas). */
export function useFrame() {
  useSyncExternalStore(store.subscribeFrame, () => store.frame);
  return store.session;
}

/** Re-renders at ~8 Hz (panels, KPIs, tables). */
export function useUi() {
  useSyncExternalStore(store.subscribeUi, () => store.ui);
  return store.session;
}
