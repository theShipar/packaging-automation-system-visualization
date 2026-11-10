# Logged specification conflicts and resolutions

1. **Two-row cell needs stations 04–06 to flow right→left.** The figures are hand-ordered for the az −45 camera; rotating them 180° would reverse every back-layer paint order. Resolution: row-2 stations are *mirrored in local x* (a mirrored view negates x and the view's `vs`, so face culling, robot slabs and depth keys stay correct). Mirroring keeps every lane length identical. Back-layer order is reviewed visually for mirrored figures and patched where a part overlaps wrongly.
2. **Robot→QA bridge is longer than `TRANSFER_LEN` = 24.** Resolution (no domain change): the bridge is drawn as a U-turn polyline and the domain's 1-D distance is mapped proportionally onto its arc length. Position is continuous at both ends; only visual speed on the bridge is higher. Alternative (lengthen the domain lane) would need an `ENGINE_VERSION` bump and invalidate saved runs; not taken.
3. **Legacy routes become drawers.** `/events`, `/assets`, `/production/batches`, … redirect to `/production?tool=<tool>` (detail routes keep their id parameter) so deep links continue to work.
4. **Font.** Urbanist removed; system UI stack per spec 10 ("don't package fonts"). User chose the spec's visual system.
5. **Revert path.** No git repo existed; `git init` in `lineflow/` with one commit per phase.
6. **"Utilisation" tile.** Spec 06 forbids invented utilisation; the existing value is `timeIn.processing / total runtime` with a ≥60 s gate, so it is kept but labelled "busy share (run)" with its window, and shown as "Not measured yet" before the gate.
7. **Energy layer.** The engine models station energy (`energyKWh`); shown only as "simulated energy".
8. **Batch switching.** The engine runs one batch per session; Batches drawer opens historical/synthetic batch records and can start a new run only through the existing restart-with-confirmation path. No silent switch.
