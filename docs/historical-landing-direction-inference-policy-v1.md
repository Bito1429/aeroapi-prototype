# Historical landing-direction inference policy v1 — frozen before results

Frozen: 2026-09-21
Development population only. US_HOLDOUT_100_260903_V1 remains sealed.

Purpose:
Infer the landing DIRECTION / runway family from a completed historical track. Exact parallel runway identity is not required.

Inputs:
- postflight track for the completed historical flight;
- FAA runway-end positions and TRUE_ALIGNMENT from the AIRAC cycle effective for that flight.

Final approach:
- final valid track point;
- final track segment whose endpoints are at least 0.5 NM apart;
- inbound bearing of that segment.

Individual runway-end eligibility (unchanged gates from v0):
1. final point <= 3.0 NM from runway threshold;
2. heading difference to TRUE_ALIGNMENT <= 20 degrees;
3. movement is toward that runway end (bearing-to-threshold difference <= 90 degrees).

Direction-family merge:
- Eligible runway ends whose TRUE_ALIGNMENT values differ by <= 10 degrees are treated as the same landing-direction family.
- Parallel left/right/center runways therefore do not compete against one another.
- A family records all member runway ends (e.g. 16L/16R) and the circular-mean alignment.
- The family's cost is the minimum member cost using the frozen v0 formula:
    threshold_distance_nm + heading_error_deg / 20.

Decision:
- zero eligible direction families => CANNOT_TELL.
- one eligible direction family => INFERRED_DIRECTION.
- more than one eligible family:
  - choose the lowest-cost family only if its cost beats the second-best family by > 0.25;
  - otherwise => CANNOT_TELL.
- Never select an exact runway from among multiple same-direction parallels merely because it is slightly closer to the final track point.

Output:
- status: INFERRED_DIRECTION | CANNOT_TELL
- direction_alignment_deg
- runway_family[] (all compatible runway-end IDs)
- candidate_family_count
- diagnostics / refusal reason.

Use in historical baseline:
- Runway-history for arrival will count landing-direction families, not exact parallel runway IDs.
- Requires >=5 prior distinct completed flights with INFERRED_DIRECTION.
- Requires a unique modal direction family.
- Otherwise REFUSE.

Product interpretation:
- A direction family may select the appropriate side/shape of the terminal fan.
- It does not authorize drawing one exact parallel-runway path unless later evidence separately identifies the exact runway.
