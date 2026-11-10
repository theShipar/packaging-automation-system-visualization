# U0 — Preservation checklist

Run before every phase commit: `npx tsc --noEmit && npx vitest run && npx playwright test smoke`.

## Domain truth (must not change)
- [ ] `src/domain/*` untouched (diff check: `git diff --stat <phase-start> -- src/domain`).
- [ ] Commands and semantics: START, PAUSE, RESUME, SET_SPEED (1/2/5/10/20), INJECT_FAULT, ACK_FAULT, CREATE_WORK_ORDER, START_WORK_ORDER, RESOLVE_FAULT, RECEIVE_MATERIAL, APPLY_SETTINGS, CLOSE_PARTIAL_CASE.
- [ ] IDs: stations `intake, assembly, robot, qa, packaging, dispatch`; units `U0001…`; serials `SN-0842-0001…`; component IDs (`ROB-GRIPPER-01`, …); fault codes; transfer IDs `TR-000001…`.
- [ ] Batch B-0842: planned 2,400, committed good 2,300; `planned = unreleased + WIP + rejected + dispatched` at every step.
- [ ] `CASE_SIZE` 12, `LANE_SPEC`, `TRANSFER_LEN` 24, `ENGINE_VERSION` unchanged → saved runs still restore.
- [ ] `tests/baseline.test.ts` BASE-001 snapshot identical (15-minute samples: shipped, WIP, rejected, unreleased, buffers, event count, event-order hash).
- [ ] BASE-002: reading every UI selector each frame leaves the session hash identical.

## Transport contract
- [ ] One unit, one root (`ProductLayer` keyed by unit id); TRANS-001…010 green.
- [ ] One loop: everything animated registers via `store.addStepper`; no second RAF.
- [ ] Pause freezes virtual clock, poses and counters; navigation still works.
- [ ] Grip/release continuity (GEO-004…006); lanes continuous across every connector, including the new bridge.

## Behaviour that must keep working
- [ ] Play / pause / resume, speed 1×–20×, +15 min deterministic step, save snapshot, restart run (with confirmation).
- [ ] Fault lifecycle: inject → acknowledge → work order → (pause for stop faults) → start repair → resolve & verify → recovered.
- [ ] Receive material, approve partial case, apply station settings with validation and SETTINGS_APPLIED event.
- [ ] Follow a serial from search; follow card; stop on manual pan.
- [ ] Batches list + detail + reconciliation, scenario lab, analytics, assets, events (filters), maintenance, quality, reports/exports, settings (role, reset data).
- [ ] Simulation / demo data label visible in the shell at all times; no real-device claims.
- [ ] Reduced-motion preference respected.
