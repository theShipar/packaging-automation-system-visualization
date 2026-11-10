/*
 * Robot pick-and-place as eight phases over mechanics progress m (0..1).
 * The wrist follows exact targets above the pickup and placement ports (inverse kinematics),
 * the kit attaches in world space when the grip closes and is released at the placement port.
 */
import type { RobotJoints } from '../vector/builder';
import { ROBOT, ROBOT_HOME, robotWrist } from '../vector/figures';
import { clamp, easeInOut, lerp, phase, type V3 } from '../vector/iso';

export const PHASES = [
  ['approach', 0, 0.16],
  ['align', 0.16, 0.28],
  ['grip', 0.28, 0.38],
  ['lift', 0.38, 0.5],
  ['carry', 0.5, 0.7],
  ['lower', 0.7, 0.83],
  ['release', 0.83, 0.9],
  ['home', 0.9, 1],
] as const;
export type RobotPhase = (typeof PHASES)[number][0];

export const CONTACT_AT = 0.33;
export const GRIP_AT = 0.38;
export const RELEASE_AT = 0.83;
/** Kit base to wrist point when gripped: fingers rest on the kit's top face. */
export const GRIP_DZ = 33;

const DEG = 180 / Math.PI;

export function ik(w: V3): Omit<RobotJoints, 'e'> {
  const { SZ, L1, L2 } = ROBOT;
  const th = Math.atan2(w[0], w[1]) * DEG;
  const r = Math.hypot(w[0], w[1]);
  const h = w[2] - SZ;
  const D = clamp(Math.hypot(r, h), Math.abs(L1 - L2) + 1e-6, L1 + L2 - 1e-6);
  const alpha = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const a1 = Math.atan2(h, r) + alpha;
  const ex = L1 * Math.cos(a1), ez = L1 * Math.sin(a1);
  const a2 = -Math.atan2(h - ez, r - ex);
  return { th, a1, a2 };
}

type Cyl = [th: number, r: number, z: number];
const cyl = (w: V3): Cyl => [Math.atan2(w[0], w[1]) * DEG, Math.hypot(w[0], w[1]), w[2]];
const fromCyl = ([th, r, z]: Cyl): V3 => [Math.sin(th / DEG) * r, Math.cos(th / DEG) * r, z];
const up = (p: V3, dz: number): V3 => [p[0], p[1], p[2] + dz];

const HOME = cyl(robotWrist(ROBOT_HOME));
const ABOVE_PICK = cyl(up(ROBOT.PICK, GRIP_DZ + 16));
const ALIGN_PICK = cyl(up(ROBOT.PICK, GRIP_DZ + 2));
const AT_PICK = cyl(up(ROBOT.PICK, GRIP_DZ));
const LIFT_PICK = cyl(up(ROBOT.PICK, GRIP_DZ + 20));
const LIFT_PLACE = cyl(up(ROBOT.PLACE, GRIP_DZ + 20));
const AT_PLACE = cyl(up(ROBOT.PLACE, GRIP_DZ));

const KEYS: [number, Cyl][] = [
  [0, HOME],
  [0.16, ABOVE_PICK],
  [0.28, ALIGN_PICK],
  [CONTACT_AT, AT_PICK],
  [GRIP_AT, AT_PICK],
  [0.5, LIFT_PICK],
  [0.7, LIFT_PLACE],
  [RELEASE_AT, AT_PLACE],
  [0.9, AT_PLACE],
  [1, HOME],
];

/** Wrist target (local robot coordinates) at mechanics progress m. */
export function wristTarget(m: number): V3 {
  const q = clamp(m, 0, 1);
  for (let i = 1; i < KEYS.length; i++) {
    const [m1, b] = KEYS[i];
    const [m0, a] = KEYS[i - 1];
    if (q <= m1) {
      const t = m1 > m0 ? easeInOut((q - m0) / (m1 - m0)) : 1;
      return fromCyl([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
    }
  }
  return fromCyl(HOME);
}

/** Finger opening: 1 open, 0.1 closed on the kit. */
export function fingers(m: number): number {
  if (m < 0.16) return lerp(ROBOT_HOME.e, 1, phase(m, 0, 0.16));
  if (m < CONTACT_AT) return 1;
  if (m < GRIP_AT) return lerp(1, 0.1, phase(m, CONTACT_AT, GRIP_AT));
  if (m < RELEASE_AT) return 0.1;
  if (m < 0.9) return lerp(0.1, 1, phase(m, RELEASE_AT, 0.9));
  return lerp(1, ROBOT_HOME.e, phase(m, 0.9, 1));
}

export function robotJoints(m: number | null): RobotJoints {
  if (m === null) return ROBOT_HOME;
  return { ...ik(wristTarget(m)), e: fingers(m) };
}

const GRIP_OFFSET: V3 = (() => {
  const w = robotWrist(robotJoints(GRIP_AT));
  return [ROBOT.PICK[0] - w[0], ROBOT.PICK[1] - w[1], ROBOT.PICK[2] - w[2]];
})();

/** Kit base position (local robot coordinates) for a unit that has reached the pickup port. */
export function robotKit(m: number): V3 {
  if (m < GRIP_AT) return ROBOT.PICK;
  if (m >= RELEASE_AT) return ROBOT.PLACE;
  const w = robotWrist(robotJoints(m));
  return [w[0] + GRIP_OFFSET[0], w[1] + GRIP_OFFSET[1], w[2] + GRIP_OFFSET[2]];
}

/** Kit position the gripper would release it at, for contact checks. */
export function releasePoint(): V3 {
  const w = robotWrist(robotJoints(RELEASE_AT));
  return [w[0] + GRIP_OFFSET[0], w[1] + GRIP_OFFSET[1], w[2] + GRIP_OFFSET[2]];
}

export function robotPhase(m: number | null): RobotPhase | 'idle' {
  if (m === null) return 'idle';
  for (const [name, a, b] of PHASES) if (m >= a && m < b) return name;
  return 'home';
}
