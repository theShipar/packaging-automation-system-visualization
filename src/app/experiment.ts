/*
 * What-if experiments on the live run. A baseline is a deep copy of the session; comparing replays
 * that copy headless to the live virtual time with no further user commands, then reads both runs
 * through the same selectors. Nothing here mutates the live session except an explicit restore.
 */
import { useSyncExternalStore } from 'react';
import { advance, dispatchCommand } from '../domain/engine';
import { summarize, type RunResult } from '../domain/scenarios';
import type { ScheduledCommand, Session } from '../domain/types';
import { formatClock } from '../domain/kpis';
import { store } from './store';

export interface Baseline {
  session: Session;
  runId: string;
  t: number;
}

export interface Comparison {
  t: number;
  base: RunResult;
  live: RunResult;
}

/** Commands that change what the line does (not just how fast the clock runs). */
const NEUTRAL = new Set(['START', 'PAUSE', 'RESUME', 'SET_SPEED']);

/** Deterministic replay of a snapshot to virtual time `t`, with no commands beyond its own schedule. */
export function replayTo(snap: Session, t: number): Session {
  const s = structuredClone(snap);
  if (s.status === 'ready') dispatchCommand(s, { kind: 'START' }, 'supervisor', 'scenario');
  if (s.status === 'paused') s.status = 'running';
  while (s.t < t && s.status === 'running') advance(s, Math.min(t, s.t + 10));
  return s;
}

/** Compare a live run against its baseline at the live virtual time. */
export function compareRuns(baseline: Session, live: Session): Comparison {
  const base = replayTo(baseline, live.t);
  return { t: live.t, base: summarize(base, 'baseline', live.t), live: summarize(live, 'live', live.t) };
}

type L = () => void;

class ExperimentStore {
  baseline: Baseline | null = null;
  result: Comparison | null = null;
  private v = 0;
  private ls = new Set<L>();
  subscribe = (l: L) => {
    this.ls.add(l);
    return () => this.ls.delete(l);
  };
  version = () => this.v;
  private emit() {
    this.v++;
    this.ls.forEach((l) => l());
  }

  /** Why a comparison is not possible right now, or null. */
  blocked(live: Session): string | null {
    const b = this.baseline;
    if (!b) return 'Capture a baseline first';
    if (live.runId !== b.runId) return 'The run was restarted after the baseline; capture a new one';
    if (live.t <= b.t) return 'Run the line past the baseline time to compare';
    return null;
  }

  /** Line-changing commands issued since the baseline. */
  changes(live: Session): ScheduledCommand[] {
    const b = this.baseline;
    if (!b || live.runId !== b.runId) return [];
    return live.commandLog.slice(b.session.commandLog.length).filter((c) => !NEUTRAL.has(c.command.kind));
  }

  capture(quiet = false) {
    const s = store.session;
    this.baseline = { session: structuredClone(s), runId: s.runId, t: s.t };
    this.result = null;
    this.emit();
    if (!quiet) store.toast(`Baseline captured at virtual ${formatClock(s.t)}`, 'success');
  }

  compare() {
    if (!this.baseline || this.blocked(store.session)) return;
    this.result = compareRuns(this.baseline.session, store.session);
    this.emit();
  }

  restore() {
    if (!this.baseline) return;
    store.importSession(structuredClone(this.baseline.session));
    this.result = null;
    this.emit();
    store.toast(`Restored the baseline at virtual ${formatClock(this.baseline.t)}`, 'info');
  }

  discard() {
    this.baseline = null;
    this.result = null;
    this.emit();
  }
}

export const experiment = new ExperimentStore();

export function useExperiment() {
  useSyncExternalStore(experiment.subscribe, experiment.version);
  return experiment;
}
