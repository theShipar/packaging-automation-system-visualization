import { describe, expect, it } from 'vitest';
import { BELT_SPEED, LANE_SPEC, SLOT, TRANSFER_LEN, inTarget, outTarget, visibleIn, visibleOut } from '../src/domain/conveyor';
import { advance, createSession, dispatchCommand } from '../src/domain/engine';
import { STATION_IDS, type Speed } from '../src/domain/types';
import { BRIDGE, BRIDGE_SCALE, CASE_FEED, DERIVED_LANES, IN_LANE, LANES, OUT_LANE, REJECT_LANES, TRANSFER_LANE, route } from '../src/transport/graph';
import { CONNECTORS, PORTS, rowPoint, toWorld } from '../src/transport/layout';
import { frameUnits } from '../src/transport/poses';
import { CONTACT_AT, GRIP_AT, GRIP_DZ, RELEASE_AT, releasePoint, robotJoints, robotKit } from '../src/transport/robotChoreography';
import { CARTON, FIGURES, ROBOT, robotWrist } from '../src/vector/figures';
import type { V3 } from '../src/vector/iso';

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const expectSame = (a: V3, b: V3, eps = 1e-9) => expect(dist(a, b)).toBeLessThan(eps);

describe('geometry', () => {
  it('GEO-001 connected ports are co-located, the figure lanes match the conveyor model, the bridge is one visible route', () => {
    expect(DERIVED_LANES).toEqual(LANE_SPEC);
    /* one straight connector per neighbour pair on a row; robot → QA crosses on the bridge */
    expect(CONNECTORS.map((c) => `${c.from}->${c.to}`)).toEqual(['intake->assembly', 'assembly->robot', 'qa->packaging', 'packaging->dispatch']);
    for (let i = 1; i < STATION_IDS.length; i++) {
      const from = STATION_IDS[i - 1], to = STATION_IDS[i];
      const tr = TRANSFER_LANE[from];
      expectSame(tr.from, OUT_LANE[from].to);
      expectSame(tr.to, IN_LANE[to].from);
      expect(tr.length).toBeCloseTo(TRANSFER_LEN, 9);
      expect(route(`${from}:out`, `${to}:in`)).toBe(tr);
    }
    for (const id of STATION_IDS) {
      if (id !== 'qa') expectSame(IN_LANE[id].from, rowPoint(PORTS[id].row, PORTS[id].in));
      expectSame(IN_LANE[id].to, PORTS[id].work);
      expect(IN_LANE[id].length).toBeCloseTo(LANE_SPEC[id].inLen, 9);
      if (id !== 'dispatch') expect(OUT_LANE[id].length).toBeCloseTo(LANE_SPEC[id].exitLen, 9);
    }
    /* bridge: placement port → QA work point, one drawn path, one steady scale */
    expectSame(BRIDGE.from, OUT_LANE.robot.from);
    expectSame(BRIDGE.to, IN_LANE.qa.to, 1e-9);
    expect(BRIDGE_SCALE).toBeGreaterThan(1);
    expect(BRIDGE_SCALE).toBeLessThan(2);
    for (const lane of [OUT_LANE.robot, TRANSFER_LANE.robot, IN_LANE.qa]) {
      expect(lane.scale).toBe(BRIDGE_SCALE);
      let prev = lane.poseAt(0);
      for (let k = 1; k <= 400; k++) {
        const at = lane.poseAt((lane.length * k) / 400);
        expect(dist(at, prev), lane.id).toBeLessThanOrEqual((BRIDGE_SCALE * lane.length) / 400 + 1e-6);
        prev = at;
      }
    }
  });

  it('GEO-002 every lane has finite endpoints and samples', () => {
    for (const l of LANES) {
      expect(Number.isFinite(l.length) && l.length > 0, l.id).toBe(true);
      for (let k = 0; k <= 20; k++) for (const v of l.poseAt((l.length * k) / 20)) expect(Number.isFinite(v), l.id).toBe(true);
      expectSame(l.poseAt(0), l.from, 1e-6);
      expectSame(l.poseAt(l.length), l.to, 1e-6);
    }
  });

  it('GEO-003 work points, reject chute and case feed start where the unit stands', () => {
    for (const id of STATION_IDS) if (id !== 'robot') expectSame(toWorld(id, FIGURES[id].work), IN_LANE[id].to, 1e-6);
    expectSame(toWorld('robot', ROBOT.PICK), IN_LANE.robot.to, 1e-6);
    expectSame(toWorld('robot', ROBOT.PLACE), OUT_LANE.robot.from, 1e-6);
    for (const r of REJECT_LANES) expectSame(r.from, IN_LANE.qa.to, 1e-6);
    expectSame(CASE_FEED.from, IN_LANE.dispatch.to, 1e-6);
  });

  it('GEO-004 robot grips the kit exactly at the pickup port', () => {
    expectSame(robotKit(0), ROBOT.PICK);
    expectSame(robotKit(GRIP_AT), ROBOT.PICK, 1e-6);
    expectSame(robotKit(GRIP_AT + 1e-7), ROBOT.PICK, 1e-4);
    for (const m of [CONTACT_AT, (CONTACT_AT + GRIP_AT) / 2, GRIP_AT]) {
      const w = robotWrist(robotJoints(m));
      expectSame(w, [ROBOT.PICK[0], ROBOT.PICK[1], ROBOT.PICK[2] + GRIP_DZ], 1e-6);
    }
  });

  it('GEO-005 robot releases the kit exactly at the placement port', () => {
    expectSame(releasePoint(), ROBOT.PLACE, 1e-6);
    expectSame(robotKit(RELEASE_AT - 1e-7), ROBOT.PLACE, 1e-4);
    expectSame(robotKit(RELEASE_AT), ROBOT.PLACE);
    expectSame(robotKit(1), ROBOT.PLACE);
  });

  it('GEO-006 the carried kit never jumps between grip and release', () => {
    let prev = robotKit(0);
    let worst = 0;
    for (let k = 1; k <= 20000; k++) {
      const at = robotKit(k / 20000);
      worst = Math.max(worst, dist(at, prev));
      prev = at;
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('GEO-007 queue slots never overlap and fit the products', () => {
    expect(SLOT).toBeGreaterThanOrEqual(CARTON.L);
    for (const id of STATION_IDS) {
      const vin = Array.from({ length: visibleIn(id) }, (_, i) => inTarget(id, i));
      for (let i = 1; i < vin.length; i++) expect(vin[i] - vin[i - 1]).toBe(SLOT);
      expect(vin[vin.length - 1]).toBeLessThanOrEqual(LANE_SPEC[id].inLen);
      if (id === 'dispatch') continue;
      for (const len of [1, visibleOut(id), visibleOut(id) + 5]) {
        const hidden = Math.max(0, len - visibleOut(id));
        const shown = Array.from({ length: len }, (_, i) => outTarget(id, i, len)).slice(hidden);
        for (let i = 1; i < shown.length; i++) expect(shown[i] - shown[i - 1]).toBe(SLOT);
        expect(shown[shown.length - 1]).toBeLessThanOrEqual(LANE_SPEC[id].exitLen - SLOT);
      }
    }
  });

  it('GEO-008 poses stay continuous through 1× → 20× → 1×', () => {
    const s = createSession({ seed: 17 });
    dispatchCommand(s, { kind: 'START' });
    advance(s, 60);
    const dt = 1 / 60;
    let last = new Map(frameUnits(s).map((u) => [u.id, u.at]));
    let speed: Speed = 1;
    // Faster than any belt, transfer, bridge or arm motion, slower than one slot per frame at 1×.
    const vMax = 3 * BELT_SPEED;
    expect(BRIDGE_SCALE).toBeLessThan(3);
    for (let f = 0; f < 60 * 30; f++) {
      const next: Speed = f < 600 ? 1 : f < 1200 ? 20 : 1;
      if (next !== speed) {
        dispatchCommand(s, { kind: 'SET_SPEED', speed: next });
        speed = next;
      }
      advance(s, s.t + dt * speed);
      const now = new Map(frameUnits(s).map((u) => [u.id, u.at]));
      for (const [id, at] of now) {
        const was = last.get(id);
        if (was) expect(dist(at, was), `${id} at t=${s.t.toFixed(3)}`).toBeLessThanOrEqual(vMax * dt * speed + 1e-6);
      }
      last = now;
    }
    expect(speed).toBe(1);
    expect(s.t).toBeGreaterThan(60 + 30 + 10 * 19);
  });
});
