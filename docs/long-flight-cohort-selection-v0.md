# Long-flight cohort selection v0 — frozen before outcome retrieval

Frozen: 2026-09-21

Purpose:
Create independent >4-hour U.S. development and sealed holdout cohorts without using runway-flow or postflight outcome information in selection.

Eligibility:
- Source: existing flight_jobs / flight_captures database only.
- scheduled_out_initial >= 2026-09-03T00:00:00Z and < 2026-09-21T00:00:00Z.
- scheduled_on_initial and scheduled_out_initial both non-null.
- scheduled duration = scheduled_on_initial - scheduled_out_initial > 240 minutes.
- origin and destination are U.S.-coded ICAOs beginning K or P.
- At least one predeparture flight_capture exists with captured_at < scheduled_out_initial.
- One row per fa_flight_id; no substitutions based on later outcomes.
- Selection query must not read actual_runway_on, final_actual_on, postflight_tracks, method_a_scores, or any runway-flow outcome field.

Ordering and assignment:
- Compute SHA-256 of fa_flight_id.
- Sort ascending by SHA-256 hex, then fa_flight_id as deterministic tie-break.
- Assign even-ranked eligible rows (0-based) to LONG_DEV_V0 and odd-ranked rows to LONG_HOLDOUT_V0.
- Target up to 100 rows per cohort; if fewer exist, use all available while preserving the even/odd assignment.
- Freeze both cohort manifests at the same time before retrieving any historical airport-arrival or track outcomes.

Sealing:
- LONG_DEV_V0 may be used to evaluate and finalize persistence/arrival hierarchy.
- LONG_HOLDOUT_V0 must not be scored, inspected for runway outcome, or used for rule construction until the complete rule is frozen.
- Existing US_HOLDOUT_100_260903_V1 remains sealed independently.
