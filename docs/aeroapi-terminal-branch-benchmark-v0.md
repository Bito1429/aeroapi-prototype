# AeroAPI terminal-branch benchmark v0 — frozen before results

Frozen: 2026-09-21

Purpose: measure how well the predeparture AeroAPI /route decoder's selected terminal procedure geometry matched the subsequently flown track.

Population:
- US_SHADOW_100_260903_V1 development set only.
- The untouched US_HOLDOUT_100_260903_V1 is not opened for this benchmark.

Branch extraction from the old predeparture canonical geometry:
- Departure branch: when the filed route begins with a procedure token, the old canonical fixes strictly between origin airport and the first filed post-procedure fix.
- Arrival branch: when the filed route ends with a procedure token, the old canonical fixes strictly between the last filed pre-procedure fix and destination airport.
- Origin/destination and the adjacent filed selector fix are excluded from branch-fix scoring.
- A branch with zero intermediate fixes is not evaluable.

Track comparison:
- Use the postflight track for the same flight job.
- For each branch fix, compute the minimum geodesic distance to the flown track polyline (not merely to sampled track points).
- Primary fix tolerance: <= 3.0 NM.
- A branch MATCH requires BOTH:
  1. >= 75% of evaluable branch fixes within 3.0 NM of the flown track polyline; and
  2. median branch-fix distance <= 3.0 NM.
- Otherwise branch = NO_MATCH.
- Report departure and arrival separately.
- Also report <= 5.0 NM fix coverage as descriptive sensitivity only; it does not change MATCH/NO_MATCH.

No result from this benchmark may alter the already-frozen development/holdout membership or the primary 3-NM/75% rule.
