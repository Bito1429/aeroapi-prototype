# ETA calibration v1 — frozen 7 Oct 2026

Purpose: provide the two ~80% ETA windows required by the mobile package without claiming a standalone duration model.

## Method frozen before reading calibration outputs

Population: closed, scoreable US flights through 2 Oct 2026 with final actual-off/on, an eligible predeparture capture, estimated_off and filed_ete_seconds.

Chronological split:
- calibration: 8 Sep–22 Sep 2026
- validation: 23 Sep–2 Oct 2026

Definitions:
- predeparture centre = latest eligible estimated_off + filed ETE
- airborne centre rule = detected takeoff + filed ETE
- symmetric interval half-width = calibration-set 80th percentile absolute arrival error, rounded upward to whole minutes
- no route-model holdouts or Europe sealed pairs are touched

Frozen v1 widths:
- predeparture: ±17 min
- airborne: ±9 min

Out-of-sample validation:
- predeparture coverage: 83.41% (n=6,215)
- airborne coverage: 82.43% (n=6,215)

Interpretation: these are conservative ~80% windows for this US test population, not universal guarantees. Continue auditing by season and operating condition.
