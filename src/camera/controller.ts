/*
 * The one camera. Pan and wheel zoom apply directly; Fit, Focus and reframe ease toward a target
 * on the store's animation loop. A new command replaces the current target (no queue). Follow
 * tracks a unit with a dead-zone using a fixed interpolation timestep.
 */
import { useSyncExternalStore } from 'react';
import { store } from '../app/store';
import {
  camEq,
  clampScale,
  deadZonePan,
  easeOutCubic,
  ensureVisible,
  fit,
  fitScale,
  focus,
  interp,
  limitsFor,
  project,
  rectCenter,
  reframe,
  validRect,
  zoomAt,
  type Bounds,
  type Cam,
  type Limits,
  type Rect,
} from './camera';

export type CameraMode = 'free' | 'overview' | 'focus-station' | 'focus-component' | 'follow-unit';

export const DURATION = { fit: 450, focus: 520, component: 450, reframe: 240, zoom: 160 } as const;
const FOLLOW_ZONE = 0.5;
const FOLLOW_ZOOM = 1.8;
const FOLLOW_RATE = 4;
const STEP = 1 / 120;

type L = () => void;

class CameraController {
  cam: Cam = { s: 1, tx: 0, ty: 0 };
  mode: CameraMode = 'overview';
  targetId: string | null = null;
  safe: Rect | null = null;
  content: Bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
  lim: Limits = { min: 0.25, max: 3.5 };
  /** True once the user pans or zooms by hand; Fit-on-resize stops then. */
  navigated = false;
  reduced = false;
  version = 0;
  /** Bounds of the current selection, so panel resizes can keep it in view. */
  selectionBounds: () => Bounds | null = () => null;
  /** World position of the followed unit this frame. */
  followPoint: (id: string) => [number, number] | null = () => null;

  private anim: { from: Cam; to: Cam; t: number; dur: number } | null = null;
  private animOff: (() => void) | null = null;
  private followOff: (() => void) | null = null;
  private acc = 0;
  private ls = new Set<L>();

  subscribe = (l: L) => {
    this.ls.add(l);
    return () => {
      this.ls.delete(l);
    };
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.ls.forEach((l) => l());
  }

  /** Current zoom as a share of Fit (1 = whole line fits the safe rect). */
  zoomRatio() {
    return this.safe ? this.cam.s / fitScale(this.content, this.safe) : 1;
  }

  /* ---------------------------------------------------------------- layout */

  setContent(b: Bounds) {
    this.content = b;
    if (this.safe) this.lim = limitsFor(b, this.safe);
  }

  setSafe(r: Rect) {
    if (!validRect(r)) return;
    const prev = this.safe;
    this.safe = r;
    this.lim = limitsFor(this.content, r);
    if (!prev) return this.set(fit(this.content, r, this.lim), 'overview');
    if (prev.x === r.x && prev.y === r.y && prev.w === r.w && prev.h === r.h) return;
    if (!this.navigated && this.mode === 'overview') return this.animateTo(fit(this.content, r, this.lim), DURATION.reframe, 'overview');
    const base = this.anim ? this.anim.to : this.cam;
    let next = reframe(base, prev, r);
    const s = clampScale(next.s, this.lim);
    if (s !== next.s) next = zoomAt(next, ...rectCenter(r), s);
    const sel = this.selectionBounds();
    if (sel) next = ensureVisible(next, sel, r, this.lim);
    this.animateTo(next, DURATION.reframe, this.mode);
  }

  /* ---------------------------------------------------------------- direct input */

  set(c: Cam, mode: CameraMode = this.mode, targetId: string | null = this.targetId) {
    this.cancelAnim();
    this.cam = c;
    this.mode = mode;
    this.targetId = targetId;
    this.emit();
  }

  panBy(dx: number, dy: number) {
    if (!dx && !dy) return;
    this.navigated = true;
    this.stopFollow('pan');
    this.set({ s: this.cam.s, tx: this.cam.tx + dx, ty: this.cam.ty + dy }, 'free', null);
  }

  zoomAtPoint(px: number, py: number, s2: number) {
    const s = clampScale(s2, this.lim);
    if (s === this.cam.s) return;
    this.navigated = true;
    const following = this.mode === 'follow-unit';
    this.set(zoomAt(this.cam, px, py, s), following ? 'follow-unit' : 'free', following ? this.targetId : null);
  }

  /** Button and keyboard zoom: pivot on the safe-rect centre, short ease. */
  zoomBy(f: number) {
    if (!this.safe) return;
    const base = this.anim ? this.anim.to : this.cam;
    const s = clampScale(base.s * f, this.lim);
    this.navigated = true;
    const following = this.mode === 'follow-unit';
    this.animateTo(zoomAt(base, ...rectCenter(this.safe), s), DURATION.zoom, following ? 'follow-unit' : 'free', following ? this.targetId : null);
  }

  /* ---------------------------------------------------------------- commands */

  fit() {
    if (!this.safe) return;
    this.stopFollow();
    this.navigated = false;
    this.animateTo(fit(this.content, this.safe, this.lim), DURATION.fit, 'overview', null);
  }

  focusBounds(b: Bounds, mode: 'focus-station' | 'focus-component', id: string) {
    if (!this.safe) return;
    this.stopFollow();
    this.navigated = true;
    this.animateTo(focus(b, this.safe, this.lim), mode === 'focus-station' ? DURATION.focus : DURATION.component, mode, id);
  }

  /** Keep b on screen without reframing more than needed (selection from a list, inspector opening). */
  reveal(b: Bounds) {
    if (!this.safe) return;
    const base = this.anim ? this.anim.to : this.cam;
    const next = ensureVisible(base, b, this.safe, this.lim);
    if (!camEq(next, base)) this.animateTo(next, DURATION.reframe, this.mode, this.targetId);
  }

  /* ---------------------------------------------------------------- follow */

  startFollow(unitId: string) {
    this.cancelAnim();
    this.mode = 'follow-unit';
    this.targetId = unitId;
    this.navigated = true;
    this.followOff?.();
    this.followOff = store.addStepper(this.followStep, { quiet: true });
    this.emit();
  }

  /** Called when store.follow changes; manual pan ends Follow with a toast. */
  stopFollow(reason?: 'pan') {
    if (this.mode !== 'follow-unit' && !this.followOff) return;
    this.followOff?.();
    this.followOff = null;
    const id = this.targetId;
    this.mode = 'free';
    this.targetId = null;
    if (store.follow) {
      const serial = store.session.units.find((u) => u.id === id)?.serial ?? id;
      store.setFollow(null);
      if (reason === 'pan') store.toast(`Stopped following ${serial} — you moved the camera`, 'info');
    }
  }

  private followStep = (dt: number) => {
    const id = this.targetId;
    if (this.mode !== 'follow-unit' || !id || !this.safe) return false;
    const p = this.followPoint(id);
    if (!p) return store.session.status === 'running';
    const r = this.safe;
    const sTarget = Math.min(this.lim.max, Math.max(this.cam.s, fitScale(this.content, r) * FOLLOW_ZOOM));
    const a = 1 - Math.exp(-FOLLOW_RATE * STEP);
    const before = this.cam;
    let c = this.cam;
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      if (Math.abs(sTarget - c.s) > 1e-4) c = zoomAt(c, ...project(c, p[0], p[1]), c.s + (sTarget - c.s) * a);
      const [dx, dy] = deadZonePan(c, p[0], p[1], r, FOLLOW_ZONE);
      if (dx || dy) c = { s: c.s, tx: c.tx + dx * a, ty: c.ty + dy * a };
    }
    const moved = !camEq(c, before, 0.02);
    if (moved) {
      this.cam = c;
      this.emit();
    }
    return moved || store.session.status === 'running';
  };

  /* ---------------------------------------------------------------- animation */

  private animateTo(to: Cam, dur: number, mode: CameraMode, targetId: string | null = null) {
    this.mode = mode;
    this.targetId = targetId;
    if (this.reduced || dur <= 0 || !this.safe) {
      this.cancelAnim();
      this.cam = to;
      return this.emit();
    }
    if (camEq(to, this.cam)) {
      this.cancelAnim();
      return this.emit();
    }
    this.anim = { from: this.cam, to, t: 0, dur: dur / 1000 };
    if (!this.animOff) this.animOff = store.addStepper(this.animStep, { quiet: true });
  }

  private animStep = (dt: number) => {
    const a = this.anim;
    if (!a || !this.safe) {
      this.cancelAnim();
      return false;
    }
    a.t = Math.min(a.dur, a.t + dt);
    this.cam = interp(a.from, a.to, easeOutCubic(a.t / a.dur), this.safe);
    this.emit();
    if (a.t >= a.dur) {
      this.cam = a.to;
      this.cancelAnim();
      return false;
    }
    return true;
  };

  private cancelAnim() {
    this.anim = null;
    this.animOff?.();
    this.animOff = null;
  }

  get animating() {
    return this.anim !== null;
  }
}

export const camera = new CameraController();

export function useCamera() {
  useSyncExternalStore(camera.subscribe, camera.getVersion);
  return camera;
}
